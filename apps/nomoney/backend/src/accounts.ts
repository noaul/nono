import type { Router } from 'express';
import { z } from 'zod';
import type { AppContext, DbValue } from './types.js';
import { asyncHandler, HttpError, parseBody } from './http.js';
import { toIsoDateTime } from './utils.js';

export const accountTypes = ['telegram', 'whatsapp', 'signal', 'wechat', 'line', 'discord', 'viber', 'other'] as const;

const accountTypeSchema = z.enum(accountTypes);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const accountSchema = z.object({
  accountType: accountTypeSchema,
  phoneNumber: z.string().trim().min(4).max(32).regex(/^[+\d\s().-]+$/)
    .refine((value) => digitsOnly(value).length >= 4, 'Phone number must contain at least four digits'),
  countryCallingCode: z.string().trim().regex(/^\+[1-9]\d{0,2}$/),
  countryIso: z.string().trim().regex(/^[a-z]{2}$/i).transform((value) => value.toUpperCase()),
  boundEmail: z.string().trim().email().max(254),
  displayName: optionalText(80),
  notes: optionalText(1000)
});
const listQuerySchema = z.object({
  phone: z.string().trim().max(32).optional().default(''),
  accountType: z.preprocess((value) => value === '' ? undefined : value, accountTypeSchema.optional())
});

type AccountBody = z.infer<typeof accountSchema>;

export function registerAccountRoutes(router: Router, context: AppContext): void {
  router.get(
    '/accounts',
    asyncHandler(async (req, res) => {
      const query = listQuerySchema.parse(req.query);
      const where: string[] = [];
      const params: DbValue[] = [];
      const phoneKey = digitsOnly(query.phone);
      if (phoneKey) {
        where.push('instr(phone_key, ?) > 0');
        params.push(phoneKey);
      }
      if (query.accountType) {
        where.push('account_type = ?');
        params.push(query.accountType);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = context.db.all<Record<string, unknown>>(
        `SELECT * FROM accounts ${whereSql} ORDER BY account_type ASC, phone_number ASC, id DESC`,
        params
      );
      res.json({ items: rows.map(mapAccountRow), meta: { total: rows.length } });
    })
  );

  router.get('/accounts/:id', (req, res) => {
    res.json({ item: getAccountOrThrow(context, Number(req.params.id)) });
  });

  router.post(
    '/accounts',
    asyncHandler(async (req, res) => {
      const body = parseBody(accountSchema, req.body);
      assertAccountAvailable(context, body);
      const now = toIsoDateTime(context.now());
      const id = context.db.insert(
        `INSERT INTO accounts (
          account_type, phone_number, phone_key, country_calling_code, country_iso,
          bound_email, display_name, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        accountValues(body, now)
      );
      res.status(201).json({ item: getAccountOrThrow(context, id) });
    })
  );

  router.put(
    '/accounts/:id',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const current = getAccountOrThrow(context, id);
      const patch = parseBody(accountSchema.partial(), req.body);
      const next: AccountBody = {
        accountType: patch.accountType ?? current.accountType,
        phoneNumber: patch.phoneNumber ?? current.phoneNumber,
        countryCallingCode: patch.countryCallingCode ?? current.countryCallingCode,
        countryIso: patch.countryIso ?? current.countryIso,
        boundEmail: patch.boundEmail ?? current.boundEmail,
        displayName: Object.prototype.hasOwnProperty.call(patch, 'displayName') ? patch.displayName : current.displayName,
        notes: Object.prototype.hasOwnProperty.call(patch, 'notes') ? patch.notes : current.notes
      };
      assertAccountAvailable(context, next, id);
      const updatedAt = toIsoDateTime(context.now());
      context.db.run(
        `UPDATE accounts SET
          account_type = ?, phone_number = ?, phone_key = ?, country_calling_code = ?, country_iso = ?,
          bound_email = ?, display_name = ?, notes = ?, updated_at = ?
        WHERE id = ?`,
        [...accountValues(next, updatedAt).slice(0, 8), updatedAt, id]
      );
      res.json({ item: getAccountOrThrow(context, id) });
    })
  );

  router.delete('/accounts/:id', (req, res) => {
    const id = Number(req.params.id);
    getAccountOrThrow(context, id);
    context.db.run('DELETE FROM accounts WHERE id = ?', [id]);
    res.status(204).end();
  });
}

function accountValues(body: AccountBody, timestamp: string): DbValue[] {
  return [
    body.accountType,
    body.phoneNumber,
    localPhoneKey(body.phoneNumber, body.countryCallingCode),
    body.countryCallingCode,
    body.countryIso,
    body.boundEmail,
    body.displayName || null,
    body.notes || null,
    timestamp,
    timestamp
  ];
}

function assertAccountAvailable(context: AppContext, body: AccountBody, excludeId?: number): void {
  const phoneKey = localPhoneKey(body.phoneNumber, body.countryCallingCode);
  const existing = context.db.get<{ id: number }>(
    `SELECT id FROM accounts
     WHERE account_type = ? AND country_calling_code = ? AND phone_key = ?${excludeId ? ' AND id <> ?' : ''}`,
    [body.accountType, body.countryCallingCode, phoneKey, ...(excludeId ? [excludeId] : [])]
  );
  if (existing) {
    throw new HttpError(409, 'ACCOUNT_ALREADY_EXISTS', 'This app account already exists');
  }
}

function getAccountOrThrow(context: AppContext, id: number) {
  const row = context.db.get<Record<string, unknown>>('SELECT * FROM accounts WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
  return mapAccountRow(row);
}

function mapAccountRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    accountType: accountTypeSchema.parse(row.account_type),
    phoneNumber: String(row.phone_number),
    countryCallingCode: String(row.country_calling_code),
    countryIso: String(row.country_iso),
    boundEmail: String(row.bound_email),
    displayName: row.display_name ? String(row.display_name) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function localPhoneKey(phoneNumber: string, callingCode: string): string {
  const phoneKey = digitsOnly(phoneNumber);
  const callingKey = digitsOnly(callingCode);
  return phoneKey.startsWith(callingKey) && phoneKey.length > callingKey.length
    ? phoneKey.slice(callingKey.length)
    : phoneKey;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}
