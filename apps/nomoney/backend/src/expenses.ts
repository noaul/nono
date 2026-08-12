import type { Router } from 'express';
import { z } from 'zod';
import { expenseSchema } from './schemas.js';
import type { AppContext, AssetType, DbValue } from './types.js';
import { asyncHandler, HttpError, parseBody } from './http.js';
import { toIsoDateTime } from './utils.js';
import { assetConfigs } from './assets.js';
import { currencySchema } from './schemas.js';

const expenseListQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(9999).optional(),
  currency: z.preprocess(emptyToUndefined, currencySchema.optional()),
  assetType: z.preprocess(emptyToUndefined, z.enum(['phone', 'vps', 'domain', 'subscription']).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(['renewal', 'monthly', 'setup', 'other']).optional()),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export function registerExpenseRoutes(router: Router, context: AppContext, allowedTypes?: AssetType[]): void {
  router.get(
    '/expenses',
    asyncHandler(async (req, res) => {
      const query = expenseListQuerySchema.parse(req.query);
      if (query.assetType && allowedTypes && !allowedTypes.includes(query.assetType)) {
        throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found');
      }
      const where: string[] = [];
      const params: DbValue[] = [];

      if (allowedTypes) {
        where.push(`asset_type IN (${allowedTypes.map(() => '?').join(', ')})`);
        params.push(...allowedTypes);
      }

      if (query.year) {
        where.push('paid_at >= ? AND paid_at <= ?');
        params.push(`${query.year}-01-01`, `${query.year}-12-31`);
      }
      if (query.currency) {
        where.push('currency = ?');
        params.push(query.currency);
      }
      if (query.assetType) {
        where.push('asset_type = ?');
        params.push(query.assetType);
      }
      if (query.category) {
        where.push('category = ?');
        params.push(query.category);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = context.db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM expenses ${whereSql}`,
        params
      );
      const rows = context.db.all<Record<string, unknown>>(
        `SELECT * FROM expenses ${whereSql} ORDER BY paid_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, query.limit, query.offset]
      );
      res.json({
        items: rows.map((row) => mapExpense(context, row)),
        meta: { total: Number(total?.count ?? 0), limit: query.limit, offset: query.offset }
      });
    })
  );

  router.post(
    '/expenses',
    asyncHandler(async (req, res) => {
      const body = parseBody(expenseSchema, req.body);
      if (allowedTypes && !allowedTypes.includes(body.assetType)) {
        throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found');
      }
      assertAssetExists(context, body.assetType, body.assetId);
      const now = toIsoDateTime(context.now());
      const id = context.db.insert(
        `INSERT INTO expenses (
          asset_type, asset_id, amount_minor_units, currency, paid_at,
          period_start, period_end, category, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          body.assetType,
          body.assetId,
          body.amountMinorUnits,
          body.currency,
          body.paidAt,
          body.periodStart ?? null,
          body.periodEnd ?? null,
          body.category ?? 'other',
          body.notes ?? null,
          now,
          now
        ]
      );
      res.status(201).json({ item: getExpenseOrThrow(context, id) });
    })
  );

  router.put(
    '/expenses/:id',
    asyncHandler(async (req, res) => {
      getExpenseOrThrow(context, Number(req.params.id));
      const body = parseBody(expenseSchema.partial(), req.body);
      if (body.assetType !== undefined || body.assetId !== undefined) {
        const current = getExpenseOrThrow(context, Number(req.params.id));
        assertAssetExists(
          context,
          (body.assetType ?? current.assetType) as AssetType,
          Number(body.assetId ?? current.assetId)
        );
      }
      const fields = [
        ['assetType', 'asset_type'],
        ['assetId', 'asset_id'],
        ['amountMinorUnits', 'amount_minor_units'],
        ['currency', 'currency'],
        ['paidAt', 'paid_at'],
        ['periodStart', 'period_start'],
        ['periodEnd', 'period_end'],
        ['category', 'category'],
        ['notes', 'notes']
      ] as const;
      const entries = fields.filter(([api]) => Object.prototype.hasOwnProperty.call(body, api));
      if (entries.length > 0) {
        const assignments = entries.map(([, db]) => `${db} = ?`);
        const values: DbValue[] = entries.map(([api]) => {
          const value = body[api];
          if (value === undefined) return null;
          return value as DbValue;
        });
        assignments.push('updated_at = ?');
        values.push(toIsoDateTime(context.now()), Number(req.params.id));
        context.db.run(`UPDATE expenses SET ${assignments.join(', ')} WHERE id = ?`, values);
      }
      res.json({ item: getExpenseOrThrow(context, Number(req.params.id)) });
    })
  );

  router.delete(
    '/expenses/:id',
    asyncHandler(async (req, res) => {
      getExpenseOrThrow(context, Number(req.params.id));
      context.db.run('DELETE FROM expenses WHERE id = ?', [Number(req.params.id)]);
      res.status(204).end();
    })
  );
}

function getExpenseOrThrow(context: AppContext, id: number) {
  const row = context.db.get<Record<string, unknown>>('SELECT * FROM expenses WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'EXPENSE_NOT_FOUND', 'Expense not found');
  return mapExpense(context, row);
}

function mapExpense(context: AppContext, row: Record<string, unknown>) {
  const assetType = String(row.asset_type) as AssetType;
  const assetId = Number(row.asset_id);
  return {
    id: Number(row.id),
    assetType,
    assetId,
    assetLabel: getAssetLabel(context, assetType, assetId),
    amountMinorUnits: Number(row.amount_minor_units),
    currency: row.currency,
    paidAt: row.paid_at,
    periodStart: row.period_start ?? null,
    periodEnd: row.period_end ?? null,
    category: row.category,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assertAssetExists(context: AppContext, assetType: AssetType, assetId: number): void {
  const config = assetConfigs.find((item) => item.type === assetType);
  if (!config) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  const row = context.db.get<Record<string, unknown>>(`SELECT id FROM ${config.table} WHERE id = ?`, [assetId]);
  if (!row) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found');
}

function getAssetLabel(context: AppContext, assetType: AssetType, assetId: number): string | null {
  const config = assetConfigs.find((item) => item.type === assetType);
  if (!config) return null;
  const displayColumn = config.fields.find((field) => field.api === config.displayField)?.db;
  if (!displayColumn) return null;
  const row = context.db.get<Record<string, unknown>>(
    `SELECT ${displayColumn} as label FROM ${config.table} WHERE id = ?`,
    [assetId]
  );
  return typeof row?.label === 'string' ? row.label : null;
}

function emptyToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}
