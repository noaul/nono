import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { assetConfigs, getAssetOrThrow } from './assets.js';
import { asyncHandler, HttpError, parseBody } from './http.js';
import type { AppContext, BillingCycle, Currency } from './types.js';
import { toIsoDate, toIsoDateTime } from './utils.js';

const renewalSchema = z.object({
  requestId: z.string().trim().min(8).max(128),
  expectedExpireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const expenseAmountSchema = z.object({
  amountMinorUnits: z.number().int().nonnegative()
});

type RenewalRow = {
  id: number;
  request_id: string;
  asset_id: number;
  previous_expire_date: string;
  previous_next_due_date: string | null;
  renewed_expire_date: string;
  expense_id: number;
  amount_minor_units: number;
  currency: Currency;
  status: 'active' | 'undone';
  created_at: string;
  undone_at: string | null;
};

type VpsRow = {
  id: number;
  amount_minor_units: number;
  currency: Currency;
  billing_cycle: string;
  next_due_date: string | null;
  expire_date: string | null;
  status: string;
};

const vpsConfig = getVpsConfig();

export function registerInternalRenewalRoutes(router: Router, context: AppContext): void {
  router.post(
    '/internal/vps/:id/renew',
    requireInternalToken(context),
    asyncHandler(async (req, res) => {
      const body = parseBody(renewalSchema, req.body);
      res.json(renewVps(context, Number(req.params.id), body));
    })
  );

  router.post(
    '/internal/vps/:id/renewals/:renewalId/undo',
    requireInternalToken(context),
    asyncHandler(async (req, res) => {
      res.json(undoVpsRenewal(context, Number(req.params.id), Number(req.params.renewalId)));
    })
  );

  router.put(
    '/internal/vps/:id/renewals/:renewalId/expense',
    requireInternalToken(context),
    asyncHandler(async (req, res) => {
      const body = parseBody(expenseAmountSchema, req.body);
      res.json(updateVpsRenewalExpense(context, Number(req.params.id), Number(req.params.renewalId), body.amountMinorUnits));
    })
  );
}

export function registerRenewalRoutes(router: Router, context: AppContext): void {
  router.post(
    '/vps/:id/renew',
    asyncHandler(async (req, res) => {
      const body = parseBody(renewalSchema, req.body);
      res.json(renewVps(context, Number(req.params.id), body));
    })
  );

  router.post(
    '/vps/:id/renewals/:renewalId/undo',
    asyncHandler(async (req, res) => {
      res.json(undoVpsRenewal(context, Number(req.params.id), Number(req.params.renewalId)));
    })
  );

  router.put(
    '/vps/:id/renewals/:renewalId/expense',
    asyncHandler(async (req, res) => {
      const body = parseBody(expenseAmountSchema, req.body);
      res.json(updateVpsRenewalExpense(context, Number(req.params.id), Number(req.params.renewalId), body.amountMinorUnits));
    })
  );
}

export function renewVps(
  context: AppContext,
  vpsId: number,
  input: z.infer<typeof renewalSchema>
) {
  const byRequest = context.db.get<RenewalRow>(
    'SELECT * FROM renewal_events WHERE request_id = ?',
    [input.requestId]
  );
  if (byRequest) {
    if (byRequest.asset_id !== vpsId) throw new HttpError(409, 'RENEWAL_REQUEST_CONFLICT', 'Renewal request is already in use');
    return renewalResponse(context, byRequest, true);
  }

  const current = getVpsRow(context, vpsId);
  assertVpsRenewable(current);
  const currentExpireDate = current.expire_date || '';
  if (currentExpireDate !== input.expectedExpireDate) {
    const previous = context.db.get<RenewalRow>(
      `SELECT * FROM renewal_events
       WHERE asset_id = ? AND previous_expire_date = ? AND status = 'active'
       ORDER BY id DESC LIMIT 1`,
      [vpsId, input.expectedExpireDate]
    );
    if (previous) return renewalResponse(context, previous, true);
    throw new HttpError(409, 'VPS_RENEWAL_DATE_CHANGED', 'VPS expiry date changed; refresh before renewing');
  }

  const cycle = parseBillingCycle(current.billing_cycle);
  const renewedExpireDate = addBillingCycle(currentExpireDate, cycle);
  const now = toIsoDateTime(context.now());
  const paidAt = toIsoDate(context.now());
  let renewalId = 0;

  context.db.exec('BEGIN');
  try {
    renewalId = context.db.insert(
      `INSERT INTO renewal_events (
         request_id, asset_type, asset_id, previous_expire_date, previous_next_due_date,
         renewed_expire_date, expense_id, amount_minor_units, currency, status, created_at, undone_at
       ) VALUES (?, 'vps', ?, ?, ?, ?, NULL, ?, ?, 'active', ?, NULL)`,
      [
        input.requestId,
        vpsId,
        currentExpireDate,
        current.next_due_date,
        renewedExpireDate,
        current.amount_minor_units,
        current.currency,
        now
      ]
    );
    const expenseId = context.db.insert(
      `INSERT INTO expenses (
         asset_type, asset_id, amount_minor_units, currency, paid_at,
         period_start, period_end, category, notes, created_at, updated_at
       ) VALUES ('vps', ?, ?, ?, ?, ?, ?, 'renewal', ?, ?, ?)`,
      [
        vpsId,
        current.amount_minor_units,
        current.currency,
        paidAt,
        currentExpireDate,
        renewedExpireDate,
        `VPS renewal event #${renewalId}`,
        now,
        now
      ]
    );
    context.db.run('UPDATE renewal_events SET expense_id = ? WHERE id = ?', [expenseId, renewalId]);
    context.db.run(
      'UPDATE vps SET expire_date = ?, next_due_date = NULL, updated_at = ? WHERE id = ?',
      [renewedExpireDate, now, vpsId]
    );
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }

  return renewalResponse(context, getRenewalRow(context, vpsId, renewalId), false);
}

export function undoVpsRenewal(context: AppContext, vpsId: number, renewalId: number) {
  const renewal = getRenewalRow(context, vpsId, renewalId);
  if (renewal.status !== 'active') throw new HttpError(409, 'VPS_RENEWAL_ALREADY_UNDONE', 'Renewal was already undone');
  const current = getVpsRow(context, vpsId);
  if (current.expire_date !== renewal.renewed_expire_date) {
    throw new HttpError(409, 'VPS_RENEWAL_UNDO_CONFLICT', 'VPS expiry date changed after this renewal');
  }
  const now = toIsoDateTime(context.now());

  context.db.exec('BEGIN');
  try {
    context.db.run(
      'UPDATE vps SET expire_date = ?, next_due_date = ?, updated_at = ? WHERE id = ?',
      [renewal.previous_expire_date, renewal.previous_next_due_date, now, vpsId]
    );
    context.db.run('DELETE FROM expenses WHERE id = ?', [renewal.expense_id]);
    context.db.run("UPDATE renewal_events SET status = 'undone', undone_at = ? WHERE id = ?", [now, renewalId]);
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }

  return { item: getAssetOrThrow(context, vpsConfig, vpsId), renewal: mapRenewal({ ...renewal, status: 'undone', undone_at: now }) };
}

export function updateVpsRenewalExpense(context: AppContext, vpsId: number, renewalId: number, amountMinorUnits: number) {
  const renewal = getRenewalRow(context, vpsId, renewalId);
  if (renewal.status !== 'active') throw new HttpError(409, 'VPS_RENEWAL_ALREADY_UNDONE', 'Renewal was already undone');
  const now = toIsoDateTime(context.now());

  context.db.exec('BEGIN');
  try {
    context.db.run('UPDATE expenses SET amount_minor_units = ?, updated_at = ? WHERE id = ?', [amountMinorUnits, now, renewal.expense_id]);
    context.db.run('UPDATE renewal_events SET amount_minor_units = ? WHERE id = ?', [amountMinorUnits, renewalId]);
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }

  return { renewal: mapRenewal({ ...renewal, amount_minor_units: amountMinorUnits }) };
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

function getVpsConfig() {
  const config = assetConfigs.find((item) => item.type === 'vps');
  if (!config) throw new Error('VPS asset configuration is missing');
  return config;
}

function getVpsRow(context: AppContext, vpsId: number): VpsRow {
  const row = context.db.get<VpsRow>('SELECT * FROM vps WHERE id = ?', [vpsId]);
  if (!row) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return row;
}

function getRenewalRow(context: AppContext, vpsId: number, renewalId: number): RenewalRow {
  const row = context.db.get<RenewalRow>(
    "SELECT * FROM renewal_events WHERE id = ? AND asset_type = 'vps' AND asset_id = ?",
    [renewalId, vpsId]
  );
  if (!row) throw new HttpError(404, 'VPS_RENEWAL_NOT_FOUND', 'VPS renewal not found');
  return row;
}

function assertVpsRenewable(vps: VpsRow): void {
  if (!['active', 'paused', 'expired'].includes(vps.status)) {
    throw new HttpError(409, 'VPS_RENEWAL_NOT_ALLOWED', 'This VPS cannot be renewed in its current state');
  }
  if (!vps.expire_date || !/^\d{4}-\d{2}-\d{2}$/.test(vps.expire_date) || !isBillingCycle(vps.billing_cycle)) {
    throw new HttpError(409, 'VPS_RENEWAL_CONFIGURATION_REQUIRED', 'Set an expiry date and billing cycle before renewing');
  }
}

function isBillingCycle(value: string): value is BillingCycle {
  return value === 'monthly' || value === 'quarterly' || value === 'annual' || value === 'biennial';
}

function parseBillingCycle(value: string): BillingCycle {
  if (!isBillingCycle(value)) throw new HttpError(409, 'VPS_RENEWAL_CONFIGURATION_REQUIRED', 'Set a billing cycle before renewing');
  return value;
}

function addBillingCycle(dateValue: string, cycle: BillingCycle): string {
  const months = cycle === 'biennial' ? 24 : cycle === 'annual' ? 12 : cycle === 'quarterly' ? 3 : 1;
  const [year, month, day] = dateValue.split('-').map(Number);
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  return [
    targetYear,
    String(targetMonthIndex + 1).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0')
  ].join('-');
}

function renewalResponse(context: AppContext, renewal: RenewalRow, idempotent: boolean) {
  return {
    idempotent,
    item: getAssetOrThrow(context, vpsConfig, renewal.asset_id),
    renewal: mapRenewal(renewal)
  };
}

function mapRenewal(row: RenewalRow) {
  return {
    id: row.id,
    previousExpireDate: row.previous_expire_date,
    renewedExpireDate: row.renewed_expire_date,
    expenseId: row.expense_id,
    amountMinorUnits: row.amount_minor_units,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    undoneAt: row.undone_at
  };
}
