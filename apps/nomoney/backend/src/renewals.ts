import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { assetConfigs, getAssetOrThrow, type AssetConfig } from './assets.js';
import { asyncHandler, HttpError, parseBody } from './http.js';
import { getSettings } from './settings.js';
import type { AppContext, AssetType, Currency } from './types.js';
import { addBillingCycle, addDays, isBillingCycle, toIsoDate, toIsoDateTime } from './utils.js';

export const autoRenewWindowDays = 60;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const renewalSchema = z.object({
  requestId: z.string().trim().min(8).max(128),
  // `expectedExpireDate` is the original VPS field name; both mean "the due date the client saw".
  expectedDueDate: isoDate.optional(),
  expectedExpireDate: isoDate.optional(),
  amountMinorUnits: z.number().int().nonnegative().optional(),
  paidAt: isoDate.optional()
}).refine((value) => value.expectedDueDate || value.expectedExpireDate, {
  message: 'expectedDueDate is required',
  path: ['expectedDueDate']
});

const expenseAmountSchema = z.object({
  amountMinorUnits: z.number().int().nonnegative()
});

type RenewalInput = {
  requestId: string;
  expectedDueDate: string;
  amountMinorUnits?: number;
  paidAt?: string;
  auto?: boolean;
};

type RenewalRow = {
  id: number;
  request_id: string;
  asset_type: AssetType;
  asset_id: number;
  previous_expire_date: string;
  previous_next_due_date: string | null;
  previous_last_renew_date: string | null;
  renewed_expire_date: string;
  expense_id: number | null;
  amount_minor_units: number;
  currency: Currency;
  status: 'active' | 'undone';
  created_at: string;
  undone_at: string | null;
};

type AssetRow = {
  id: number;
  amount_minor_units: number;
  currency: Currency;
  billing_cycle: string;
  next_due_date: string | null;
  expire_date: string | null;
  last_renew_date?: string | null;
  status: string;
  purchase_type?: string | null;
  auto_renew?: number | null;
};

/**
 * Which date column a renewal advances. VPS and domains track an expiry date;
 * phone cards and subscriptions track the next charge date.
 */
const anchorColumn: Record<AssetType, 'expire_date' | 'next_due_date'> = {
  vps: 'expire_date',
  domain: 'expire_date',
  phone: 'next_due_date',
  subscription: 'next_due_date'
};

export function registerInternalRenewalRoutes(router: Router, context: AppContext): void {
  router.post(
    '/internal/vps/:id/renew',
    requireInternalToken(context),
    asyncHandler(async (req, res) => {
      res.json(renewAsset(context, 'vps', Number(req.params.id), parseRenewalInput(req.body)));
    })
  );

  router.post(
    '/internal/vps/:id/renewals/:renewalId/undo',
    requireInternalToken(context),
    asyncHandler(async (req, res) => {
      res.json(undoRenewal(context, 'vps', Number(req.params.id), Number(req.params.renewalId)));
    })
  );

  router.put(
    '/internal/vps/:id/renewals/:renewalId/expense',
    requireInternalToken(context),
    asyncHandler(async (req, res) => {
      const body = parseBody(expenseAmountSchema, req.body);
      res.json(updateRenewalExpense(context, 'vps', Number(req.params.id), Number(req.params.renewalId), body.amountMinorUnits));
    })
  );
}

export function registerRenewalRoutes(router: Router, context: AppContext, allowedTypes: AssetType[]): void {
  for (const config of assetConfigs.filter((item) => allowedTypes.includes(item.type))) {
    router.post(
      `/${config.route}/:id/renew`,
      asyncHandler(async (req, res) => {
        res.json(renewAsset(context, config.type, Number(req.params.id), parseRenewalInput(req.body)));
      })
    );

    router.get(`/${config.route}/:id/renewals`, (req, res) => {
      const id = Number(req.params.id);
      getAssetRow(context, config, id);
      const rows = context.db.all<RenewalRow>(
        'SELECT * FROM renewal_events WHERE asset_type = ? AND asset_id = ? ORDER BY id DESC LIMIT 100',
        [config.type, id]
      );
      res.json({ items: rows.map(mapRenewal) });
    });

    router.post(
      `/${config.route}/:id/renewals/:renewalId/undo`,
      asyncHandler(async (req, res) => {
        res.json(undoRenewal(context, config.type, Number(req.params.id), Number(req.params.renewalId)));
      })
    );

    router.put(
      `/${config.route}/:id/renewals/:renewalId/expense`,
      asyncHandler(async (req, res) => {
        const body = parseBody(expenseAmountSchema, req.body);
        res.json(updateRenewalExpense(context, config.type, Number(req.params.id), Number(req.params.renewalId), body.amountMinorUnits));
      })
    );
  }
}

function parseRenewalInput(body: unknown): RenewalInput {
  const parsed = parseBody(renewalSchema, body ?? {});
  return {
    requestId: parsed.requestId,
    expectedDueDate: (parsed.expectedDueDate ?? parsed.expectedExpireDate)!,
    amountMinorUnits: parsed.amountMinorUnits,
    paidAt: parsed.paidAt
  };
}

export function renewAsset(context: AppContext, type: AssetType, assetId: number, input: RenewalInput) {
  const config = getConfig(type);
  const code = type.toUpperCase();
  const byRequest = context.db.get<RenewalRow>('SELECT * FROM renewal_events WHERE request_id = ?', [input.requestId]);
  if (byRequest) {
    if (byRequest.asset_type !== type || byRequest.asset_id !== assetId) {
      throw new HttpError(409, 'RENEWAL_REQUEST_CONFLICT', 'Renewal request is already in use');
    }
    return renewalResponse(context, config, byRequest, true);
  }

  const current = getAssetRow(context, config, assetId);
  assertRenewable(current, type);
  const column = anchorColumn[type];
  const currentDueDate = current[column] || '';
  if (currentDueDate !== input.expectedDueDate) {
    const previous = context.db.get<RenewalRow>(
      `SELECT * FROM renewal_events
       WHERE asset_type = ? AND asset_id = ? AND previous_expire_date = ? AND status = 'active'
       ORDER BY id DESC LIMIT 1`,
      [type, assetId, input.expectedDueDate]
    );
    if (previous) return renewalResponse(context, config, previous, true);
    throw new HttpError(409, `${code}_RENEWAL_DATE_CHANGED`, 'The due date changed; refresh before renewing');
  }

  const cycle = current.billing_cycle;
  if (!isBillingCycle(cycle)) throw new HttpError(409, `${code}_RENEWAL_CONFIGURATION_REQUIRED`, 'Set a billing cycle before renewing');
  const renewedDate = addBillingCycle(currentDueDate, cycle);
  const amount = input.amountMinorUnits ?? Number(current.amount_minor_units ?? 0);
  const now = toIsoDateTime(context.now());
  const today = toIsoDate(context.now(), getSettings(context).timezone);
  const paidAt = input.paidAt ?? (input.auto ? currentDueDate : today);
  let renewalId = 0;

  context.db.exec('BEGIN');
  try {
    renewalId = context.db.insert(
      `INSERT INTO renewal_events (
         request_id, asset_type, asset_id, previous_expire_date, previous_next_due_date, previous_last_renew_date,
         renewed_expire_date, expense_id, amount_minor_units, currency, status, created_at, undone_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'active', ?, NULL)`,
      [
        input.requestId,
        type,
        assetId,
        currentDueDate,
        current.next_due_date,
        current.last_renew_date ?? null,
        renewedDate,
        amount,
        current.currency,
        now
      ]
    );
    const expenseId = context.db.insert(
      `INSERT INTO expenses (
         asset_type, asset_id, amount_minor_units, currency, paid_at,
         period_start, period_end, category, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'renewal', ?, ?, ?)`,
      [
        type,
        assetId,
        amount,
        current.currency,
        paidAt,
        currentDueDate,
        renewedDate,
        `${input.auto ? 'Auto-renewal' : 'Renewal'} event #${renewalId}`,
        now,
        now
      ]
    );
    context.db.run('UPDATE renewal_events SET expense_id = ? WHERE id = ?', [expenseId, renewalId]);
    if (type === 'vps') {
      context.db.run('UPDATE vps SET expire_date = ?, next_due_date = NULL, updated_at = ? WHERE id = ?', [renewedDate, now, assetId]);
    } else if (type === 'domain') {
      context.db.run(
        'UPDATE domains SET expire_date = ?, next_due_date = ?, last_renew_date = ?, updated_at = ? WHERE id = ?',
        [renewedDate, renewedDate, paidAt, now, assetId]
      );
    } else {
      context.db.run(`UPDATE ${config.table} SET next_due_date = ?, updated_at = ? WHERE id = ?`, [renewedDate, now, assetId]);
    }
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }

  return renewalResponse(context, config, getRenewalRow(context, type, assetId, renewalId), false);
}

export function undoRenewal(context: AppContext, type: AssetType, assetId: number, renewalId: number) {
  const config = getConfig(type);
  const code = type.toUpperCase();
  const renewal = getRenewalRow(context, type, assetId, renewalId);
  if (renewal.status !== 'active') throw new HttpError(409, `${code}_RENEWAL_ALREADY_UNDONE`, 'Renewal was already undone');
  const current = getAssetRow(context, config, assetId);
  if (current[anchorColumn[type]] !== renewal.renewed_expire_date) {
    throw new HttpError(409, `${code}_RENEWAL_UNDO_CONFLICT`, 'The due date changed after this renewal');
  }
  const now = toIsoDateTime(context.now());

  context.db.exec('BEGIN');
  try {
    if (type === 'domain') {
      context.db.run(
        'UPDATE domains SET expire_date = ?, next_due_date = ?, last_renew_date = ?, updated_at = ? WHERE id = ?',
        [renewal.previous_expire_date, renewal.previous_next_due_date, renewal.previous_last_renew_date, now, assetId]
      );
    } else if (type === 'vps') {
      context.db.run(
        'UPDATE vps SET expire_date = ?, next_due_date = ?, updated_at = ? WHERE id = ?',
        [renewal.previous_expire_date, renewal.previous_next_due_date, now, assetId]
      );
    } else {
      context.db.run(`UPDATE ${config.table} SET next_due_date = ?, updated_at = ? WHERE id = ?`, [renewal.previous_expire_date, now, assetId]);
    }
    if (renewal.expense_id !== null) context.db.run('DELETE FROM expenses WHERE id = ?', [renewal.expense_id]);
    context.db.run("UPDATE renewal_events SET status = 'undone', undone_at = ? WHERE id = ?", [now, renewalId]);
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }

  return { item: getAssetOrThrow(context, config, assetId), renewal: mapRenewal({ ...renewal, status: 'undone', undone_at: now }) };
}

export function updateRenewalExpense(context: AppContext, type: AssetType, assetId: number, renewalId: number, amountMinorUnits: number) {
  const renewal = getRenewalRow(context, type, assetId, renewalId);
  if (renewal.status !== 'active') throw new HttpError(409, `${type.toUpperCase()}_RENEWAL_ALREADY_UNDONE`, 'Renewal was already undone');
  const now = toIsoDateTime(context.now());

  context.db.exec('BEGIN');
  try {
    if (renewal.expense_id !== null) {
      context.db.run('UPDATE expenses SET amount_minor_units = ?, updated_at = ? WHERE id = ?', [amountMinorUnits, now, renewal.expense_id]);
    }
    context.db.run('UPDATE renewal_events SET amount_minor_units = ? WHERE id = ?', [amountMinorUnits, renewalId]);
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }

  return { renewal: mapRenewal({ ...renewal, amount_minor_units: amountMinorUnits }) };
}

/**
 * Rolls forward overdue items that renew automatically (auto-renew on), recording
 * one expense per elapsed cycle so the "actual spend" figures need no manual entry.
 * Request ids are derived from the due date, so repeated runs are idempotent.
 */
export function runAutoRenewals(context: AppContext, allowedTypes: AssetType[]) {
  const settings = getSettings(context);
  const renewed: Array<{ assetType: AssetType; assetId: number; dueDate: string }> = [];
  if (!settings.autoRenewEnabled) return renewed;
  const today = toIsoDate(context.now(), settings.timezone);
  // Items overdue for longer than this were probably dropped without being
  // marked cancelled; leave them overdue for a human to look at.
  const oldestDue = addDays(today, -autoRenewWindowDays);
  for (const config of assetConfigs.filter((item) => allowedTypes.includes(item.type))) {
    const column = anchorColumn[config.type];
    const rows = context.db.all<AssetRow>(
      `SELECT * FROM ${config.table}
       WHERE archived_at IS NULL AND status = 'active' AND auto_renew = 1 AND ${column} < ? AND ${column} >= ?`,
      [today, oldestDue]
    );
    for (const row of rows) {
      if (row.purchase_type === 'buyout' || !isBillingCycle(row.billing_cycle)) continue;
      // Bound the catch-up so a decades-old date cannot spin for long.
      for (let step = 0; step < 120; step += 1) {
        const current = getAssetRow(context, config, row.id);
        const dueDate = current[column];
        if (!dueDate || dueDate >= today) break;
        renewAsset(context, config.type, row.id, {
          requestId: `auto:${config.type}:${row.id}:${dueDate}`,
          expectedDueDate: dueDate,
          auto: true
        });
        renewed.push({ assetType: config.type, assetId: row.id, dueDate });
      }
    }
  }
  return renewed;
}

export function requireInternalToken(context: AppContext): RequestHandler {
  return (req, res, next) => {
    const expected = context.internalToken;
    const supplied = req.get('x-nono-internal-token') || '';
    if (!expected || !safeEqual(supplied, expected)) {
      res.status(401).json({ error: { code: 'INTERNAL_AUTH_REQUIRED', message: 'Internal authentication required' } });
      return;
    }
    next();
  };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getConfig(type: AssetType): AssetConfig {
  const config = assetConfigs.find((item) => item.type === type);
  if (!config) throw new Error(`Asset configuration for ${type} is missing`);
  return config;
}

function getAssetRow(context: AppContext, config: AssetConfig, id: number): AssetRow {
  const row = context.db.get<AssetRow>(`SELECT * FROM ${config.table} WHERE id = ? AND archived_at IS NULL`, [id]);
  if (!row) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return row;
}

function getRenewalRow(context: AppContext, type: AssetType, assetId: number, renewalId: number): RenewalRow {
  const row = context.db.get<RenewalRow>(
    'SELECT * FROM renewal_events WHERE id = ? AND asset_type = ? AND asset_id = ?',
    [renewalId, type, assetId]
  );
  if (!row) throw new HttpError(404, `${type.toUpperCase()}_RENEWAL_NOT_FOUND`, 'Renewal not found');
  return row;
}

function assertRenewable(row: AssetRow, type: AssetType): void {
  const code = type.toUpperCase();
  if (!['active', 'paused', 'expired'].includes(row.status) || row.purchase_type === 'buyout') {
    throw new HttpError(409, `${code}_RENEWAL_NOT_ALLOWED`, 'This item cannot be renewed in its current state');
  }
  const dueDate = row[anchorColumn[type]];
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !isBillingCycle(row.billing_cycle)) {
    throw new HttpError(409, `${code}_RENEWAL_CONFIGURATION_REQUIRED`, 'Set a due date and billing cycle before renewing');
  }
}

function renewalResponse(context: AppContext, config: AssetConfig, renewal: RenewalRow, idempotent: boolean) {
  return {
    idempotent,
    item: getAssetOrThrow(context, config, renewal.asset_id),
    renewal: mapRenewal(renewal)
  };
}

function mapRenewal(row: RenewalRow) {
  return {
    id: row.id,
    assetType: row.asset_type,
    previousExpireDate: row.previous_expire_date,
    renewedExpireDate: row.renewed_expire_date,
    expenseId: row.expense_id,
    amountMinorUnits: row.amount_minor_units,
    currency: row.currency,
    status: row.status,
    auto: row.request_id.startsWith('auto:'),
    createdAt: row.created_at,
    undoneAt: row.undone_at
  };
}
