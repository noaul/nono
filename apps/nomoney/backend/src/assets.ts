import type { Router } from 'express';
import { z } from 'zod';
import type { AppContext, AssetType, BillingCycle, Currency, DbValue } from './types.js';
import { asyncHandler, HttpError, parseBody, parsePatchBody } from './http.js';
import { domainSchema, phoneSchema, subscriptionSchema } from './schemas.js';
import { addBillingCycle, currencies, daysBetween, isBillingCycle, parseJsonArray, predictedMonthly, toIsoDate, toIsoDateTime } from './utils.js';
import { billingCycleSchema, currencySchema, statusSchema } from './schemas.js';
import { getSettings } from './settings.js';
import { fetchExchangeRates, type ExchangeRates } from './exchange-rates.js';
import {
  calculateDomainRarity,
  composeDomainName,
  inferDomainExtension,
  normalizeDomainExtension,
  providerConsoleUrl
} from './domainProviders.js';

type Field = { api: string; db: string };
type RenewalTotals = {
  count: number;
  windowStart: string;
  windowEnd: string;
  byCurrency: Partial<Record<Currency, number>>;
  displayCurrency: Currency;
  convertedTotal: {
    amountMinorUnits: number;
    currency: Currency;
    exchangeRateDate: string | null;
  };
  yearlyTotal: CurrencySummary;
};

type CurrencySummary = {
  count: number;
  windowStart: string;
  windowEnd: string;
  byCurrency: Partial<Record<Currency, number>>;
  convertedTotal: {
    amountMinorUnits: number;
    currency: Currency;
    exchangeRateDate: string | null;
  };
};

type RegistrarAccountOption = {
  registrar: string;
  account: string;
  value: string;
  count: number;
};

type AssetSummary = {
  total: number;
  totalsByCurrency: Partial<Record<Currency, number>>;
  dueWithin30Days: number;
  statusCounts: Record<string, number>;
  phone?: {
    domestic: number;
    foreign: number;
    carrierCounts: Array<{ carrier: string; count: number }>;
    foreignCountryCounts: Array<{ country: string; count: number }>;
    monthlyTotal: Partial<Record<Currency, number>>;
    domesticMonthlyTotal: Partial<Record<Currency, number>>;
    activeCount: number;
    riskWithin30Days: number;
    riskWithin60Days: number;
  };
  domain?: {
    registrarCount: number;
    accountCount: number;
    topSuffix: string;
    autoRenewCount: number;
    riskWithin30Days: number;
  };
};

export interface AssetConfig {
  route: string;
  table: string;
  type: AssetType;
  schema: z.ZodObject;
  fields: Field[];
  searchable: string[];
  displayField: string;
  dueFields: string[];
}

const commonFields: Field[] = [
  { api: 'amountMinorUnits', db: 'amount_minor_units' },
  { api: 'currency', db: 'currency' },
  { api: 'billingCycle', db: 'billing_cycle' },
  { api: 'billingDay', db: 'billing_day' },
  { api: 'nextDueDate', db: 'next_due_date' },
  { api: 'autoRenew', db: 'auto_renew' },
  { api: 'paymentMethod', db: 'payment_method' },
  { api: 'renewalUrl', db: 'renewal_url' },
  { api: 'status', db: 'status' },
  { api: 'tags', db: 'tags' },
  { api: 'notes', db: 'notes' }
];

export const assetConfigs: AssetConfig[] = [
  {
    route: 'phones',
    table: 'phones',
    type: 'phone',
    schema: phoneSchema,
    fields: [
      { api: 'phoneType', db: 'phone_type' },
      { api: 'isEsim', db: 'is_esim' },
      { api: 'cardNumber', db: 'card_number' },
      { api: 'poPhoneNumber', db: 'po_phone_number' },
      { api: 'carrier', db: 'carrier' },
      { api: 'planName', db: 'plan_name' },
      { api: 'realNamePerson', db: 'real_name_person' },
      { api: 'userName', db: 'user_name' },
      { api: 'isSecondaryCard', db: 'is_secondary_card' },
      { api: 'dataAllowanceGb', db: 'data_allowance_gb' },
      { api: 'voiceMinutes', db: 'voice_minutes' },
      { api: 'monthlyRentMinorUnits', db: 'monthly_rent_minor_units' },
      { api: 'attachedServices', db: 'attached_services' },
      { api: 'attachedServicesMinorUnits', db: 'attached_services_minor_units' },
      { api: 'discountMinorUnits', db: 'discount_minor_units' },
      { api: 'cashbackMinorUnits', db: 'cashback_minor_units' },
      { api: 'countryCode', db: 'country_code' },
      { api: 'homeLocation', db: 'home_location' },
      { api: 'aPhoneNumber', db: 'a_phone_number' },
      { api: 'mainlandNumber', db: 'mainland_number' },
      { api: 'realNameMethod', db: 'real_name_method' },
      { api: 'balanceMinorUnits', db: 'balance_minor_units' },
      { api: 'totalKeepaliveUntil', db: 'total_keepalive_until' },
      { api: 'keepaliveMethod', db: 'keepalive_method' },
      { api: 'minimumKeepaliveAmountMinorUnits', db: 'minimum_keepalive_amount_minor_units' },
      { api: 'keepaliveDays', db: 'keepalive_days' },
      { api: 'activateDate', db: 'activate_date' },
      { api: 'expireDate', db: 'expire_date' },
      ...commonFields
    ],
    searchable: ['card_number', 'po_phone_number', 'carrier', 'plan_name', 'real_name_person', 'user_name', 'country_code', 'home_location', 'a_phone_number', 'mainland_number', 'tags', 'notes'],
    displayField: 'card_number',
    dueFields: ['next_due_date', 'expire_date']
  },
  {
    route: 'domains',
    table: 'domains',
    type: 'domain',
    schema: domainSchema,
    fields: [
      { api: 'domainName', db: 'domain_name' },
      { api: 'registrar', db: 'registrar' },
      { api: 'registrarAccount', db: 'registrar_account' },
      { api: 'registrarUrl', db: 'registrar_url' },
      { api: 'dnsProvider', db: 'dns_provider' },
      { api: 'purpose', db: 'purpose' },
      { api: 'registerDate', db: 'register_date' },
      { api: 'lastRenewDate', db: 'last_renew_date' },
      { api: 'domainExtension', db: 'domain_extension' },
      { api: 'rarityScore', db: 'rarity_score' },
      { api: 'expireDate', db: 'expire_date' },
      { api: 'rdapExpireDate', db: 'rdap_expire_date' },
      { api: 'rdapCheckedAt', db: 'rdap_checked_at' },
      { api: 'rdapError', db: 'rdap_error' },
      { api: 'sslExpiresAt', db: 'ssl_expires_at' },
      { api: 'sslIssuer', db: 'ssl_issuer' },
      { api: 'sslCheckedAt', db: 'ssl_checked_at' },
      { api: 'sslError', db: 'ssl_error' },
      ...commonFields
    ],
    searchable: ['domain_name', 'registrar', 'registrar_account', 'dns_provider', 'purpose', 'domain_extension', 'tags', 'notes'],
    displayField: 'domain_name',
    dueFields: ['next_due_date', 'expire_date']
  },
  {
    route: 'subscriptions',
    table: 'subscriptions',
    type: 'subscription',
    schema: subscriptionSchema,
    fields: [
      { api: 'name', db: 'name' },
      { api: 'purchaseType', db: 'purchase_type' },
      { api: 'provider', db: 'provider' },
      { api: 'account', db: 'account' },
      { api: 'category', db: 'category' },
      { api: 'email', db: 'email' },
      { api: 'phoneNumber', db: 'phone_number' },
      { api: 'licenseKey', db: 'license_key' },
      { api: 'deviceLimit', db: 'device_limit' },
      { api: 'content', db: 'content' },
      ...commonFields
    ],
    searchable: ['name', 'provider', 'account', 'category', 'email', 'phone_number', 'license_key', 'content', 'tags', 'notes'],
    displayField: 'name',
    dueFields: ['next_due_date']
  }
];

const listQuerySchema = z.object({
  q: z.string().optional().default(''),
  status: z.preprocess(emptyToUndefined, statusSchema.optional()),
  currency: z.preprocess(emptyToUndefined, currencySchema.optional()),
  billingCycle: z.preprocess(emptyToUndefined, billingCycleSchema.optional()),
  purchaseType: z.preprocess(emptyToUndefined, z.enum(['subscription', 'buyout']).optional()),
  phoneType: z.preprocess(emptyToUndefined, z.enum(['domestic', 'foreign']).optional()),
  domainExtension: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  registrarAccount: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  displayCurrency: z.preprocess(emptyToUndefined, currencySchema.optional()),
  tag: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  category: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  sort: z.preprocess(
    emptyToUndefined,
    z
      .enum(['dueDate', 'renewalDate', 'expireDate', 'registerDate', 'rarity', 'amount', 'name', 'createdAt'])
      .optional()
      .default('dueDate')
  ),
  direction: z.preprocess(emptyToUndefined, z.enum(['asc', 'desc']).optional().default('asc')),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export function registerAssetRoutes(router: Router, context: AppContext, allowedTypes?: AssetType[]): void {
  const configs = assetConfigs.filter((config) => !allowedTypes || allowedTypes.includes(config.type));
  router.get('/assets/lookup', (_req, res) => {
    const items = configs.flatMap((config) =>
      context.db
        .all<Record<string, unknown>>(
          `SELECT * FROM ${config.table} WHERE archived_at IS NULL ORDER BY ${displayColumn(config)} ASC, id DESC`
        )
        .map((row) => ({
          assetType: config.type,
          assetId: Number(row.id),
          label: String(row[displayColumn(config)] ?? ''),
          provider: getProviderLabel(row),
          status: String(row.status ?? ''),
          currency: normalizeCurrency(row.currency),
          amountMinorUnits: Number(row.amount_minor_units ?? 0)
        }))
    );
    res.json({ items });
  });

  for (const config of configs) {
    router.get(
      `/${config.route}`,
      asyncHandler(async (req, res) => {
        const query = listQuerySchema.parse(req.query);
        const where: string[] = [];
        const params: DbValue[] = [];
        const q = query.q.trim();

        if (query.status) {
          where.push('status = ?');
          params.push(query.status);
        } else {
          where.push('archived_at IS NULL');
        }

        const renewalWhere = [...where];
        const renewalParams = [...params];

        if (query.currency) {
          where.push('currency = ?');
          params.push(query.currency);
        }

        if (query.billingCycle) {
          where.push('billing_cycle = ?');
          params.push(query.billingCycle);
          renewalWhere.push('billing_cycle = ?');
          renewalParams.push(query.billingCycle);
        }

        if (config.type === 'subscription' && query.purchaseType) {
          where.push('purchase_type = ?');
          params.push(query.purchaseType);
        }

        if (config.type === 'phone' && query.phoneType) {
          where.push('phone_type = ?');
          params.push(query.phoneType);
          renewalWhere.push('phone_type = ?');
          renewalParams.push(query.phoneType);
        }

        if (config.type === 'domain' && query.domainExtension) {
          where.push('LOWER(domain_extension) = LOWER(?)');
          params.push(normalizeDomainExtension(query.domainExtension));
          renewalWhere.push('LOWER(domain_extension) = LOWER(?)');
          renewalParams.push(normalizeDomainExtension(query.domainExtension));
        }

        // Tags are stored as a JSON array, so match the quoted element.
        const tagOptionWhere = [...where];
        const tagOptionParams = [...params];
        if (query.tag) {
          where.push('tags LIKE ?');
          params.push(`%${JSON.stringify(query.tag)}%`);
        }

        if (config.type === 'subscription' && query.category) {
          where.push("LOWER(COALESCE(category, '')) = LOWER(?)");
          params.push(query.category);
        }

        const accountOptionWhere = [...where];
        const accountOptionParams = [...params];

        if (config.type === 'domain' && query.registrarAccount) {
          const accountFilter = parseRegistrarAccountFilter(query.registrarAccount);
          if (accountFilter) {
            where.push("LOWER(COALESCE(registrar, '')) = LOWER(?)");
            params.push(accountFilter.registrar);
            where.push('LOWER(registrar_account) = LOWER(?)');
            params.push(accountFilter.account);
            renewalWhere.push("LOWER(COALESCE(registrar, '')) = LOWER(?)");
            renewalParams.push(accountFilter.registrar);
            renewalWhere.push('LOWER(registrar_account) = LOWER(?)');
            renewalParams.push(accountFilter.account);
          } else {
            where.push('LOWER(registrar_account) LIKE LOWER(?)');
            params.push(`%${query.registrarAccount}%`);
            renewalWhere.push('LOWER(registrar_account) LIKE LOWER(?)');
            renewalParams.push(`%${query.registrarAccount}%`);
          }
        }

        if (q) {
          where.push(`(${config.searchable.map((field) => `LOWER(${field}) LIKE LOWER(?)`).join(' OR ')})`);
          renewalWhere.push(`(${config.searchable.map((field) => `LOWER(${field}) LIKE LOWER(?)`).join(' OR ')})`);
          for (const _field of config.searchable) {
            params.push(`%${q}%`);
            renewalParams.push(`%${q}%`);
          }
        }

        const whereSql = where.join(' AND ');
        const summaryRows = context.db.all<Record<string, unknown>>(
          `SELECT * FROM ${config.table} WHERE ${whereSql}`,
          params
        );
        const sort = sortExpression(config, query.sort);
        const direction = query.direction.toUpperCase();
        const rows = context.db.all<Record<string, unknown>>(
          `SELECT * FROM ${config.table} WHERE ${whereSql} ORDER BY ${sort} ${direction}, id DESC LIMIT ? OFFSET ?`,
          [...params, query.limit, query.offset]
        );
        const meta: Record<string, unknown> = {
          total: summaryRows.length,
          limit: query.limit,
          offset: query.offset,
          assetSummary: calculateAssetSummary(context, config, summaryRows),
          tagOptions: collectTagOptions(context.db.all<{ tags: string }>(
            `SELECT tags FROM ${config.table} WHERE ${tagOptionWhere.join(' AND ')}`,
            tagOptionParams
          ))
        };
        if (config.type === 'subscription') {
          meta.categoryOptions = context.db.all<{ category: string }>(
            `SELECT DISTINCT TRIM(category) AS category FROM ${config.table} WHERE archived_at IS NULL AND TRIM(COALESCE(category, '')) <> '' ORDER BY category`
          ).map((row) => row.category);
        }
        if (config.type === 'domain') {
          meta.renewalTotals = await calculateRenewalTotals(
            context,
            config,
            renewalWhere.join(' AND '),
            renewalParams,
            query.displayCurrency
          );
          meta.registrarAccounts = getRegistrarAccountOptions(
            context,
            config,
            accountOptionWhere.join(' AND '),
            accountOptionParams
          );
        }

        const items = rows.map((row) => mapAssetRow(config, row));
        if (config.type === 'phone') attachLinkedAccounts(context, items as Array<Record<string, unknown>>);
        res.json({
          items: config.type === 'domain'
            ? await addDomainDisplayCurrency(context, items, query.displayCurrency)
            : items,
          meta
        });
      })
    );

    router.get(
      `/${config.route}/:id`,
      asyncHandler(async (req, res) => {
        res.json({ item: getAssetOrThrow(context, config, Number(req.params.id)) });
      })
    );

    router.post(
      `/${config.route}`,
      asyncHandler(async (req, res) => {
        const id = createAsset(context, config, req.body);
        res.status(201).json({ item: getAssetOrThrow(context, config, id) });
      })
    );


    router.put(
      `/${config.route}/:id`,
      asyncHandler(async (req, res) => {
        const current = getAssetOrThrow(context, config, Number(req.params.id));
        const body = enrichAssetBody(config, parsePatchBody(config.schema.partial(), req.body), current);
        const entries = config.fields.filter((field) => Object.prototype.hasOwnProperty.call(body, field.api));
        if (entries.length > 0) {
          const assignments = entries.map((field) => `${field.db} = ?`);
          const params = entries.map((field) => toDbValue(field.api, body[field.api]));
          assignments.push('updated_at = ?');
          params.push(toIsoDateTime(context.now()), Number(req.params.id));
          context.db.run(`UPDATE ${config.table} SET ${assignments.join(', ')} WHERE id = ?`, params);
        }
        res.json({ item: getAssetOrThrow(context, config, Number(req.params.id)) });
      })
    );

    router.delete(
      `/${config.route}/:id`,
      asyncHandler(async (req, res) => {
        getAssetOrThrow(context, config, Number(req.params.id));
        const now = toIsoDateTime(context.now());
        context.db.run(
          `UPDATE ${config.table} SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`,
          [now, now, Number(req.params.id)]
        );
        res.status(204).end();
      })
    );

    router.post(
      `/${config.route}/:id/restore`,
      asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        getAssetOrThrow(context, config, id);
        const now = toIsoDateTime(context.now());
        context.db.run(
          `UPDATE ${config.table} SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?`,
          [now, id]
        );
        res.json({ item: getAssetOrThrow(context, config, id) });
      })
    );

    router.delete(
      `/${config.route}/:id/permanent`,
      asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        const item = getAssetOrThrow(context, config, id);
        if (!item.archivedAt) {
          throw new HttpError(409, 'ASSET_NOT_ARCHIVED', 'Only archived assets can be permanently deleted');
        }
        context.db.run('DELETE FROM expenses WHERE asset_type = ? AND asset_id = ?', [config.type, id]);
        context.db.run('DELETE FROM renewal_events WHERE asset_type = ? AND asset_id = ?', [config.type, id]);
        context.db.run('DELETE FROM reminder_logs WHERE asset_type = ? AND asset_id = ?', [config.type, id]);
        context.db.run(`DELETE FROM ${config.table} WHERE id = ?`, [id]);
        res.status(204).end();
      })
    );
  }
}

/**
 * Accounts are stored by phone number rather than by card, so a card's
 * accounts are the ones whose number matches the card's number.
 */
export function attachLinkedAccounts(context: AppContext, items: Array<Record<string, unknown>>): void {
  const accounts = context.db.all<{ id: number; account_type: string; phone_key: string }>(
    'SELECT id, account_type, phone_key FROM accounts WHERE archived_at IS NULL'
  );
  for (const item of items) {
    const numbers = [item.cardNumber, item.aPhoneNumber, item.poPhoneNumber, item.mainlandNumber]
      .map((value) => String(value ?? '').replace(/\D/g, ''))
      .filter((value) => value.length >= 6);
    item.linkedAccounts = accounts
      .filter((account) => account.phone_key.length >= 6 && numbers.some((number) => number.endsWith(account.phone_key) || account.phone_key.endsWith(number)))
      .map((account) => ({ id: account.id, accountType: account.account_type }));
  }
}

/** Validates and inserts one asset; shared by the create route and CSV import. */
export function createAsset(context: AppContext, config: AssetConfig, input: unknown): number {
  const body = enrichAssetBody(config, parseBody(config.schema, input) as Record<string, unknown>);
  const now = toIsoDateTime(context.now());
  const columns = [...config.fields.map((field) => field.db), 'created_at', 'updated_at'];
  const values = [...config.fields.map((field) => toDbValue(field.api, body[field.api])), now, now];
  const placeholders = columns.map(() => '?').join(', ');
  return context.db.insert(
    `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );
}

export function getAssetOrThrow(context: AppContext, config: AssetConfig, id: number) {
  const row = context.db.get<Record<string, unknown>>(`SELECT * FROM ${config.table} WHERE id = ?`, [id]);
  if (!row) {
    throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  }
  return mapAssetRow(config, row);
}

export function mapAssetRow(config: AssetConfig, row: Record<string, unknown>) {
  const item: Record<string, unknown> = {
    id: Number(row.id),
    assetType: config.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null
  };
  for (const field of config.fields) {
    const value = row[field.db];
    if (field.api === 'autoRenew' || field.api === 'isSecondaryCard' || field.api === 'isEsim') {
      item[field.api] = Boolean(value);
    } else if (field.api === 'tags') {
      item[field.api] = parseJsonArray(value);
    } else if (field.api === 'domainExtension') {
      item[field.api] = value ?? inferDomainExtension(String(row.domain_name ?? ''));
    } else if (field.api === 'rarityScore') {
      item[field.api] = Number(value ?? 0);
    } else {
      item[field.api] = value ?? null;
    }
  }
  return item;
}

export function toDbValue(apiField: string, value: unknown): DbValue {
  if (apiField === 'tags') {
    return JSON.stringify(Array.isArray(value) ? value : []);
  }
  if (apiField === 'autoRenew' || apiField === 'isSecondaryCard' || apiField === 'isEsim') {
    return value ? 1 : 0;
  }
  if (apiField === 'domainExtension') {
    return normalizeDomainExtension(value);
  }
  if (apiField === 'rarityScore') {
    return Math.max(0, Math.min(100, Number(value ?? 0)));
  }
  if (value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || value === null) {
    return value;
  }
  return String(value);
}

export function getDueDate(row: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    if (typeof row[field] === 'string' && row[field]) {
      return String(row[field]);
    }
  }
  return null;
}

export function normalizeBillingCycle(value: unknown): BillingCycle {
  return isBillingCycle(value) ? value : 'monthly';
}

export function normalizeCurrency(value: unknown): Currency {
  if (typeof value === 'string' && (currencies as readonly string[]).includes(value)) return value as Currency;
  return 'CNY';
}

function emptyToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

function displayColumn(config: AssetConfig): string {
  return config.fields.some((field) => field.db === config.displayField) ? config.displayField : 'id';
}

function sortExpression(config: AssetConfig, sort: z.infer<typeof listQuerySchema>['sort']): string {
  if (sort === 'renewalDate') return "COALESCE(next_due_date, expire_date, '')";
  if (sort === 'expireDate') return "COALESCE(expire_date, next_due_date, '')";
  if (sort === 'registerDate') return "COALESCE(register_date, '')";
  if (sort === 'rarity') return 'rarity_score';
  if (sort === 'amount') return 'amount_minor_units';
  if (sort === 'name') return displayColumn(config);
  if (sort === 'createdAt') return 'created_at';
  return `COALESCE(${[...config.dueFields, "''"].join(', ')})`;
}

function collectTagOptions(rows: Array<{ tags: string }>): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseJsonArray(row.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function getProviderLabel(row: Record<string, unknown>): string | null {
  for (const key of ['provider', 'registrar', 'carrier']) {
    if (typeof row[key] === 'string' && row[key]) {
      return String(row[key]);
    }
  }
  return null;
}

function enrichAssetBody(
  config: AssetConfig,
  body: Record<string, unknown>,
  current?: Record<string, unknown>
): Record<string, unknown> {
  if (!body.billingDay && !current?.billingDay) {
    const date = String(config.type === 'domain'
      ? body.expireDate || body.nextDueDate || current?.expireDate || current?.nextDueDate || ''
      : body.nextDueDate || body.expireDate || current?.nextDueDate || current?.expireDate || '');
    const day = Number(date.slice(8, 10));
    if (day >= 1 && day <= 31) body = { ...body, billingDay: day };
  }
  if (config.type === 'phone') {
    return enrichPhoneBody(body, current);
  }

  if (config.type === 'subscription') {
    return enrichSubscriptionBody(body, current);
  }

  if (config.type !== 'domain') {
    return body;
  }

  const next = { ...body };
  const hasDomainName = Object.prototype.hasOwnProperty.call(next, 'domainName');
  const hasExtension = Object.prototype.hasOwnProperty.call(next, 'domainExtension');
  const hasRegistrar = Object.prototype.hasOwnProperty.call(next, 'registrar');
  const hasBillingCycle = Object.prototype.hasOwnProperty.call(next, 'billingCycle');
  const hasRegisterDate = Object.prototype.hasOwnProperty.call(next, 'registerDate');
  const hasLastRenewDate = Object.prototype.hasOwnProperty.call(next, 'lastRenewDate');
  const hasExpireDate = Object.prototype.hasOwnProperty.call(next, 'expireDate');
  const hasNextDueDate = Object.prototype.hasOwnProperty.call(next, 'nextDueDate');

  if (hasDomainName || hasExtension || !current) {
    const rawDomain = hasDomainName ? next.domainName : current?.domainName;
    const rawExtension = hasExtension
      ? next.domainExtension
      : inferDomainExtension(rawDomain) ?? current?.domainExtension;
    const domainName = composeDomainName(rawDomain, rawExtension);
    const extension = normalizeDomainExtension(rawExtension) ?? inferDomainExtension(domainName);
    next.domainName = domainName;
    next.domainExtension = extension;
    next.rarityScore = calculateDomainRarity(domainName, extension);
  }

  if (hasRegistrar || !current) {
    const registrar = hasRegistrar ? next.registrar : current?.registrar;
    next.registrarUrl = providerConsoleUrl(registrar);
  }

  const previousRegisterDate = stringValue(current?.registerDate);
  const nextRegisterDate = stringValue(next.registerDate ?? current?.registerDate);
  const nextLastRenewDate = stringValue(next.lastRenewDate ?? current?.lastRenewDate);
  if (!hasLastRenewDate && nextRegisterDate && (!current || !nextLastRenewDate || (hasRegisterDate && nextLastRenewDate === previousRegisterDate))) {
    next.lastRenewDate = nextRegisterDate;
  }

  const billingCycle = normalizeBillingCycle(next.billingCycle ?? current?.billingCycle);
  const renewalAnchor = stringValue(next.lastRenewDate ?? current?.lastRenewDate) || stringValue(next.registerDate ?? current?.registerDate);
  const shouldCalculateExpireDate =
    !hasExpireDate && Boolean(renewalAnchor) && (!current || hasBillingCycle || hasLastRenewDate || hasRegisterDate);
  if (shouldCalculateExpireDate) {
    next.expireDate = addBillingCycle(renewalAnchor, billingCycle);
  }

  const effectiveExpireDate = stringValue(next.expireDate ?? current?.expireDate);
  if (!hasNextDueDate && effectiveExpireDate && (!current || hasExpireDate || shouldCalculateExpireDate || !stringValue(current?.nextDueDate))) {
    next.nextDueDate = effectiveExpireDate;
  }
  return next;
}

function enrichPhoneBody(body: Record<string, unknown>, current?: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  const phoneType = stringValue(next.phoneType ?? current?.phoneType) || 'domestic';
  if (phoneType !== 'domestic') {
    return next;
  }

  next.isEsim = false;

  const rentValue = next.monthlyRentMinorUnits ?? current?.monthlyRentMinorUnits;
  const attachedValue = next.attachedServicesMinorUnits ?? current?.attachedServicesMinorUnits;
  const discountValue = next.discountMinorUnits ?? current?.discountMinorUnits;
  const cashbackValue = next.cashbackMinorUnits ?? current?.cashbackMinorUnits;
  if ([rentValue, attachedValue, discountValue, cashbackValue].every((value) => numberValue(value) === null)) {
    return next;
  }

  const rent = numberValue(rentValue) ?? 0;
  const attachedServices = numberValue(attachedValue) ?? 0;
  const discount = numberValue(discountValue) ?? 0;
  const cashback = numberValue(cashbackValue) ?? 0;
  next.amountMinorUnits = Math.max(rent + attachedServices - discount - cashback, 0);
  return next;
}

function enrichSubscriptionBody(body: Record<string, unknown>, current?: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  if (Object.prototype.hasOwnProperty.call(next, 'licenseKey') && !stringValue(next.licenseKey)) {
    next.licenseKey = null;
  }
  const purchaseType = stringValue(next.purchaseType ?? current?.purchaseType) || 'subscription';
  if (purchaseType === 'buyout') {
    next.billingCycle = 'annual';
    next.nextDueDate = null;
    next.autoRenew = false;
    next.renewalUrl = null;
  }
  return next;
}

function calculateAssetSummary(
  context: AppContext,
  config: AssetConfig,
  rows: Array<Record<string, unknown>>
): AssetSummary {
  const totalsByCurrency: Partial<Record<Currency, number>> = {};
  const statusCounts: Record<string, number> = {};
  const today = toIsoDate(context.now(), getSettings(context).timezone);
  let dueWithin30Days = 0;

  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    totalsByCurrency[currency] = (totalsByCurrency[currency] ?? 0) + Number(row.amount_minor_units ?? 0);
    const status = stringValue(row.status) || 'unknown';
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (withinDays(today, assetDueDate(config, row), 30)) dueWithin30Days += 1;
  }

  const summary: AssetSummary = {
    total: rows.length,
    totalsByCurrency,
    dueWithin30Days,
    statusCounts
  };

  if (config.type === 'phone') summary.phone = calculatePhoneSummary(rows, today, monthlyEquivalentTotals(rows));
  if (config.type === 'domain') summary.domain = calculateDomainSummary(rows, dueWithin30Days);
  return summary;
}

/** Per-currency totals with every billing cycle converted to a monthly amount. */
function monthlyEquivalentTotals(rows: Array<Record<string, unknown>>): Partial<Record<Currency, number>> {
  const totals: Partial<Record<Currency, number>> = {};
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    totals[currency] = (totals[currency] ?? 0)
      + predictedMonthly(Number(row.amount_minor_units ?? 0), normalizeBillingCycle(row.billing_cycle));
  }
  return totals;
}

function calculatePhoneSummary(
  rows: Array<Record<string, unknown>>,
  today: string,
  monthlyTotal: Partial<Record<Currency, number>>
) {
  const carrierCounts = new Map<string, number>();
  const foreignCountryCounts = new Map<string, number>();
  const domesticMonthlyTotal: Partial<Record<Currency, number>> = {};
  let domestic = 0;
  let foreign = 0;
  let activeCount = 0;
  let riskWithin30Days = 0;
  let riskWithin60Days = 0;

  for (const row of rows) {
    const isForeign = stringValue(row.phone_type) === 'foreign';
    if (isForeign) {
      foreign += 1;
      incrementCount(foreignCountryCounts, phoneCountry(row));
    } else {
      domestic += 1;
      incrementCount(carrierCounts, stringValue(row.carrier));
      const currency = normalizeCurrency(row.currency);
      domesticMonthlyTotal[currency] = (domesticMonthlyTotal[currency] ?? 0)
        + predictedMonthly(Number(row.amount_minor_units ?? 0), normalizeBillingCycle(row.billing_cycle));
    }
    if (stringValue(row.status) === 'active') activeCount += 1;
    const riskDate = stringValue(row.total_keepalive_until) || stringValue(row.next_due_date) || stringValue(row.expire_date);
    if (withinDays(today, riskDate, 30)) riskWithin30Days += 1;
    if (withinDays(today, riskDate, 60)) riskWithin60Days += 1;
  }

  return {
    domestic,
    foreign,
    carrierCounts: sortedCounts(carrierCounts, 'carrier'),
    foreignCountryCounts: sortedCounts(foreignCountryCounts, 'country'),
    monthlyTotal,
    domesticMonthlyTotal,
    activeCount,
    riskWithin30Days,
    riskWithin60Days
  };
}

function calculateDomainSummary(rows: Array<Record<string, unknown>>, riskWithin30Days: number) {
  const registrars = new Set<string>();
  const accounts = new Set<string>();
  const suffixCounts = new Map<string, number>();
  let autoRenewCount = 0;

  for (const row of rows) {
    const registrar = stringValue(row.registrar);
    const account = stringValue(row.registrar_account);
    const suffix = normalizeDomainExtension(row.domain_extension || inferDomainExtension(row.domain_name));
    if (registrar) registrars.add(registrar);
    if (account) accounts.add(`${registrar}::${account}`);
    if (suffix) incrementCount(suffixCounts, suffix);
    if (Boolean(row.auto_renew)) autoRenewCount += 1;
  }

  const topSuffix = [...suffixCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? '-';
  return { registrarCount: registrars.size, accountCount: accounts.size, topSuffix, autoRenewCount, riskWithin30Days };
}

function assetDueDate(config: AssetConfig, row: Record<string, unknown>): string {
  for (const field of config.dueFields) {
    const value = stringValue(row[field]);
    if (value) return value;
  }
  return '';
}

function withinDays(today: string, date: string, limit: number): boolean {
  return Boolean(date) && daysBetween(today, date) <= limit;
}

function incrementCount(counts: Map<string, number>, value: string) {
  const key = value || '-';
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sortedCounts(counts: Map<string, number>, key: 'carrier'): Array<{ carrier: string; count: number }>;
function sortedCounts(counts: Map<string, number>, key: 'country'): Array<{ country: string; count: number }>;
function sortedCounts(counts: Map<string, number>, key: 'carrier' | 'country') {
  const entries = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return key === 'carrier'
    ? entries.map(([carrier, count]) => ({ carrier, count }))
    : entries.map(([country, count]) => ({ country, count }));
}

function phoneCountry(row: Record<string, unknown>): string {
  const homeLocation = stringValue(row.home_location).trim().toUpperCase();
  if (homeLocation) return normalizeCountryShortName(homeLocation);
  const dialCode = stringValue(row.country_code).replace(/^\+/, '');
  const byDialCode: Record<string, string> = {
    '1': 'US', '44': 'UK', '49': 'DE', '81': 'JP', '82': 'KR',
    '852': 'HK', '853': 'MAC', '886': 'TW'
  };
  return byDialCode[dialCode] || dialCode || '-';
}

function normalizeCountryShortName(value: string): string {
  const aliases: Record<string, string> = {
    HONGKONG: 'HK', 'HONG KONG': 'HK', MACAO: 'MAC', MACAU: 'MAC', MO: 'MAC',
    GB: 'UK', UNITEDKINGDOM: 'UK', 'UNITED KINGDOM': 'UK',
    UNITEDSTATES: 'US', 'UNITED STATES': 'US', USA: 'US'
  };
  return aliases[value] || value;
}

async function calculateRenewalTotals(
  context: AppContext,
  config: AssetConfig,
  whereSql: string,
  params: DbValue[],
  displayCurrency?: Currency
): Promise<RenewalTotals> {
  const settings = getSettings(context);
  const targetCurrency = displayCurrency ?? 'CNY';
  const monthlyWindow = nextCalendarMonthWindow(context.now(), settings.timezone);
  const yearlyWindow = nextRollingYearWindow(context.now(), settings.timezone);
  const rows = context.db.all<{
    amount_minor_units: number | null;
    currency: Currency | null;
    due_date: string | null;
  }>(
    `SELECT amount_minor_units, currency, COALESCE(next_due_date, expire_date) as due_date
     FROM ${config.table}
     WHERE ${whereSql}`,
    params
  );
  const byCurrency: Partial<Record<Currency, number>> = {};
  const yearlyByCurrency: Partial<Record<Currency, number>> = {};
  let nextMonthCount = 0;
  let nextYearCount = 0;

  for (const row of rows) {
    const amount = Number(row.amount_minor_units ?? 0);
    const currency = normalizeCurrency(row.currency);
    const dueDate = stringValue(row.due_date);
    if (dueDate >= monthlyWindow.start && dueDate <= monthlyWindow.end) {
      byCurrency[currency] = (byCurrency[currency] ?? 0) + amount;
      nextMonthCount += 1;
    }
    if (dueDate >= yearlyWindow.start && dueDate <= yearlyWindow.end) {
      yearlyByCurrency[currency] = (yearlyByCurrency[currency] ?? 0) + amount;
      nextYearCount += 1;
    }
  }

  const [converted, yearlyConverted] = await Promise.all([
    convertCurrencyTotals(context, byCurrency, targetCurrency),
    convertCurrencyTotals(context, yearlyByCurrency, targetCurrency)
  ]);

  return {
    count: nextMonthCount,
    windowStart: monthlyWindow.start,
    windowEnd: monthlyWindow.end,
    byCurrency: roundCurrencyTotals(byCurrency),
    displayCurrency: targetCurrency,
    convertedTotal: {
      amountMinorUnits: converted.amountMinorUnits,
      currency: targetCurrency,
      exchangeRateDate: converted.exchangeRateDate
    },
    yearlyTotal: {
      count: nextYearCount,
      windowStart: yearlyWindow.start,
      windowEnd: yearlyWindow.end,
      byCurrency: roundCurrencyTotals(yearlyByCurrency),
      convertedTotal: {
        amountMinorUnits: yearlyConverted.amountMinorUnits,
        currency: targetCurrency,
        exchangeRateDate: yearlyConverted.exchangeRateDate
      }
    }
  };
}

function getRegistrarAccountOptions(
  context: AppContext,
  config: AssetConfig,
  whereSql: string,
  params: DbValue[]
): RegistrarAccountOption[] {
  return context.db
    .all<{ registrar: string | null; account: string | null; count: number }>(
      `SELECT
         MIN(COALESCE(NULLIF(TRIM(registrar), ''), '')) as registrar,
         MIN(TRIM(registrar_account)) as account,
         COUNT(*) as count
       FROM ${config.table}
       WHERE ${whereSql}
         AND registrar_account IS NOT NULL
         AND TRIM(registrar_account) <> ''
       GROUP BY LOWER(COALESCE(registrar, '')), LOWER(TRIM(registrar_account))
       ORDER BY LOWER(COALESCE(registrar, '')) ASC, LOWER(TRIM(registrar_account)) ASC`,
      params
    )
    .map((row) => {
      const registrar = stringValue(row.registrar);
      const account = stringValue(row.account);
      return {
        registrar,
        account,
        value: registrarAccountFilterValue(registrar, account),
        count: Number(row.count ?? 0)
      };
    });
}

async function addDomainDisplayCurrency(
  context: AppContext,
  items: Record<string, unknown>[],
  displayCurrency?: Currency
): Promise<Record<string, unknown>[]> {
  const targetCurrency = displayCurrency ?? 'CNY';
  const sourceCurrencies = Array.from(
    new Set(items.map((item) => normalizeCurrency(item.currency)))
  ).filter((currency) => currency !== targetCurrency);
  const exchangeRates = await fetchExchangeRates(context.fetch ?? globalThis.fetch, targetCurrency, sourceCurrencies);

  return items.map((item) => {
    const sourceCurrency = normalizeCurrency(item.currency);
    const amount = Number(item.amountMinorUnits ?? 0);
    const converted = convertCurrencyAmount(amount, sourceCurrency, targetCurrency, exchangeRates);
    return {
      ...item,
      displayAmountMinorUnits: converted.amountMinorUnits,
      displayCurrency: targetCurrency,
      displayExchangeRateDate: converted.exchangeRateDate
    };
  });
}

function convertCurrencyAmount(
  amountMinorUnits: number,
  sourceCurrency: Currency,
  targetCurrency: Currency,
  exchangeRates: ExchangeRates
): { amountMinorUnits: number | null; exchangeRateDate: string | null } {
  if (sourceCurrency === targetCurrency) {
    return { amountMinorUnits: Math.round(amountMinorUnits), exchangeRateDate: null };
  }

  const rate = exchangeRates.rates[sourceCurrency];
  if (!rate) {
    return { amountMinorUnits: null, exchangeRateDate: null };
  }

  return {
    amountMinorUnits: Math.round(amountMinorUnits / rate),
    exchangeRateDate: exchangeRates.date
  };
}

function registrarAccountFilterValue(registrar: string, account: string): string {
  return `${registrar}::${account}`;
}

function parseRegistrarAccountFilter(value: string): { registrar: string; account: string } | null {
  const separator = value.indexOf('::');
  if (separator < 0) return null;
  const registrar = value.slice(0, separator).trim();
  const account = value.slice(separator + 2).trim();
  return account ? { registrar, account } : null;
}

function roundCurrencyTotals(values: Partial<Record<Currency, number>>): Partial<Record<Currency, number>> {
  return Object.fromEntries(
    Object.entries(values).map(([currency, value]) => [currency, Math.round(value)])
  ) as Partial<Record<Currency, number>>;
}

async function convertCurrencyTotals(
  context: AppContext,
  values: Partial<Record<Currency, number>>,
  targetCurrency: Currency
): Promise<{ amountMinorUnits: number; exchangeRateDate: string | null }> {
  const currenciesToConvert = currenciesWithValues(values).filter((currency) => currency !== targetCurrency);
  if (currenciesToConvert.length === 0) {
    return { amountMinorUnits: Math.round(values[targetCurrency] ?? 0), exchangeRateDate: null };
  }

  const exchangeRates = await fetchExchangeRates(context.fetch ?? globalThis.fetch, targetCurrency, currenciesToConvert);
  let total = values[targetCurrency] ?? 0;
  for (const currency of currenciesToConvert) {
    const rate = exchangeRates.rates[currency];
    if (!rate) continue;
    total += Number(values[currency] ?? 0) / rate;
  }
  return {
    amountMinorUnits: Math.round(total),
    exchangeRateDate: exchangeRates.date
  };
}

function currenciesWithValues(values: Partial<Record<Currency, number>>): Currency[] {
  return [...currencies].filter((currency) => Number(values[currency] ?? 0) > 0);
}

function nextCalendarMonthWindow(now: Date, timeZone: string): { start: string; end: string } {
  const { year, month } = datePartsInTimeZone(now, timeZone);
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    start: toIsoDate(start),
    end: toIsoDate(end)
  };
}

function nextRollingYearWindow(now: Date, timeZone: string): { start: string; end: string } {
  const { year, month } = datePartsInTimeZone(now, timeZone);
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 12, 0));
  return {
    start: toIsoDate(start),
    end: toIsoDate(end)
  };
}

function datePartsInTimeZone(date: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? date.getUTCMonth() + 1);
  return { year, month };
}


function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
