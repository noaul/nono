import type { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AppContext, AssetType, BillingCycle, Currency, DbValue, SshAuthType, SshExecOptions } from './types.js';
import { asyncHandler, HttpError, parseBody } from './http.js';
import { domainSchema, phoneSchema, subscriptionSchema, vpsSchema } from './schemas.js';
import { parseJsonArray, toIsoDate, toIsoDateTime } from './utils.js';
import { billingCycleSchema, currencySchema, statusSchema } from './schemas.js';
import { getSettings } from './settings.js';
import { runSshCommand } from './ssh.js';
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

type MonitorSnapshot = {
  status: 'online' | 'offline';
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  netInBps: number | null;
  netOutBps: number | null;
  netTotalInBytes: number | null;
  netTotalOutBytes: number | null;
  load1: number | null;
  uptimeSeconds: number | null;
  updatedAt: string;
};

const vpsSshActionSchema = z.object({
  ipAddress: z.string().trim().optional().nullable(),
  sshHost: z.string().trim().optional().nullable(),
  sshPort: z.number().int().min(1).max(65535).optional().nullable(),
  sshUser: z.string().trim().optional().nullable(),
  sshAuthType: z.enum(['password', 'privateKey']).optional().nullable(),
  sshPassword: z.string().trim().optional().nullable(),
  sshPrivateKey: z.string().trim().optional().nullable(),
  sshPrivateKeyPassphrase: z.string().trim().optional().nullable()
});

const probeInstallSchema = vpsSshActionSchema.extend({
  probePort: z.number().int().min(1).max(65535).optional(),
  probeApiKey: z.string().trim().optional().nullable()
});

const sensitiveVpsFields = new Set([
  'sshPassword',
  'sshPrivateKey',
  'sshPrivateKeyPassphrase',
  'probeApiKey'
]);

export interface AssetConfig {
  route: string;
  table: string;
  type: AssetType;
  schema: z.AnyZodObject;
  fields: Field[];
  searchable: string[];
  displayField: string;
  dueFields: string[];
}

const commonFields: Field[] = [
  { api: 'amountMinorUnits', db: 'amount_minor_units' },
  { api: 'currency', db: 'currency' },
  { api: 'billingCycle', db: 'billing_cycle' },
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
      { api: 'billingDay', db: 'billing_day' },
      { api: 'activateDate', db: 'activate_date' },
      { api: 'expireDate', db: 'expire_date' },
      ...commonFields
    ],
    searchable: ['card_number', 'po_phone_number', 'carrier', 'plan_name', 'real_name_person', 'user_name', 'country_code', 'home_location', 'a_phone_number', 'mainland_number'],
    displayField: 'card_number',
    dueFields: ['next_due_date', 'expire_date']
  },
  {
    route: 'vps',
    table: 'vps',
    type: 'vps',
    schema: vpsSchema,
    fields: [
      { api: 'name', db: 'name' },
      { api: 'provider', db: 'provider' },
      { api: 'ipAddress', db: 'ip_address' },
      { api: 'location', db: 'location' },
      { api: 'cpu', db: 'cpu' },
      { api: 'memory', db: 'memory' },
      { api: 'storage', db: 'storage' },
      { api: 'bandwidth', db: 'bandwidth' },
      { api: 'os', db: 'os' },
      { api: 'sshHost', db: 'ssh_host' },
      { api: 'sshPort', db: 'ssh_port' },
      { api: 'sshUser', db: 'ssh_user' },
      { api: 'sshAuthType', db: 'ssh_auth_type' },
      { api: 'sshPassword', db: 'ssh_password' },
      { api: 'sshPrivateKey', db: 'ssh_private_key' },
      { api: 'sshPrivateKeyPassphrase', db: 'ssh_private_key_passphrase' },
      { api: 'sshCommand', db: 'ssh_command' },
      { api: 'probeUrl', db: 'probe_url' },
      { api: 'probePort', db: 'probe_port' },
      { api: 'probeApiKey', db: 'probe_api_key' },
      { api: 'probeInstallStatus', db: 'probe_install_status' },
      { api: 'probeInstallMessage', db: 'probe_install_message' },
      { api: 'probeInstalledAt', db: 'probe_installed_at' },
      { api: 'sshLastTestStatus', db: 'ssh_last_test_status' },
      { api: 'sshLastTestMessage', db: 'ssh_last_test_message' },
      { api: 'sshLastTestedAt', db: 'ssh_last_tested_at' },
      { api: 'monitorStatus', db: 'monitor_status' },
      { api: 'monitorCpuPercent', db: 'monitor_cpu_percent' },
      { api: 'monitorMemoryPercent', db: 'monitor_memory_percent' },
      { api: 'monitorDiskPercent', db: 'monitor_disk_percent' },
      { api: 'monitorNetInBps', db: 'monitor_net_in_bps' },
      { api: 'monitorNetOutBps', db: 'monitor_net_out_bps' },
      { api: 'monitorNetTotalInBytes', db: 'monitor_net_total_in_bytes' },
      { api: 'monitorNetTotalOutBytes', db: 'monitor_net_total_out_bytes' },
      { api: 'monitorLoad1', db: 'monitor_load1' },
      { api: 'monitorUptimeSeconds', db: 'monitor_uptime_seconds' },
      { api: 'monitorUpdatedAt', db: 'monitor_updated_at' },
      { api: 'startDate', db: 'start_date' },
      { api: 'expireDate', db: 'expire_date' },
      ...commonFields
    ],
    searchable: ['name', 'provider', 'ip_address', 'location'],
    displayField: 'name',
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
      ...commonFields
    ],
    searchable: ['domain_name', 'registrar', 'registrar_account', 'dns_provider', 'purpose', 'domain_extension'],
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
      { api: 'provider', db: 'provider' },
      { api: 'account', db: 'account' },
      { api: 'category', db: 'category' },
      ...commonFields
    ],
    searchable: ['name', 'provider', 'account', 'category'],
    displayField: 'name',
    dueFields: ['next_due_date']
  }
];

const listQuerySchema = z.object({
  q: z.string().optional().default(''),
  status: z.preprocess(emptyToUndefined, statusSchema.optional()),
  currency: z.preprocess(emptyToUndefined, currencySchema.optional()),
  billingCycle: z.preprocess(emptyToUndefined, billingCycleSchema.optional()),
  phoneType: z.preprocess(emptyToUndefined, z.enum(['domestic', 'foreign']).optional()),
  domainExtension: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  registrarAccount: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  displayCurrency: z.preprocess(emptyToUndefined, currencySchema.optional()),
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

export function registerAssetRoutes(router: Router, context: AppContext): void {
  router.get('/assets/lookup', (_req, res) => {
    const items = assetConfigs.flatMap((config) =>
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

  for (const config of assetConfigs) {
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
        const count = context.db.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${config.table} WHERE ${whereSql}`,
          params
        );
        const sort = sortExpression(config, query.sort);
        const direction = query.direction.toUpperCase();
        const rows = context.db.all<Record<string, unknown>>(
          `SELECT * FROM ${config.table} WHERE ${whereSql} ORDER BY ${sort} ${direction}, id DESC LIMIT ? OFFSET ?`,
          [...params, query.limit, query.offset]
        );
        const meta: Record<string, unknown> = { total: Number(count?.count ?? 0), limit: query.limit, offset: query.offset };
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

    if (config.type === 'vps') {
      router.get(
        `/${config.route}/:id/monitor`,
        asyncHandler(async (req, res) => {
          const id = Number(req.params.id);
          const item = getAssetOrThrow(context, config, id, { includeSecrets: true });
          const monitor = await refreshVpsMonitor(context, config, id, item);
          res.json({ monitor, item: getAssetOrThrow(context, config, id) });
        })
      );

      router.post(
        `/${config.route}/:id/ssh/test`,
        asyncHandler(async (req, res) => {
          const id = Number(req.params.id);
          const item = getAssetOrThrow(context, config, id, { includeSecrets: true });
          const body = parseBody(vpsSshActionSchema, req.body ?? {}) as Record<string, unknown>;
          const actionItem = mergeActionItem(item, body);
          const testedAt = toIsoDateTime(context.now());
          try {
            const result = await executeVpsSsh(context, actionItem, 'printf moneypulse-ssh-ok', 20_000);
            const message = normalizeActionMessage(result.stdout || result.stderr || 'moneypulse-ssh-ok');
            context.db.run(
              `UPDATE ${config.table}
               SET ssh_last_test_status = ?, ssh_last_test_message = ?, ssh_last_tested_at = ?, updated_at = ?
               WHERE id = ?`,
              ['success', message, testedAt, testedAt, id]
            );
            res.json({ ok: true, testedAt, message, item: getAssetOrThrow(context, config, id) });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'SSH connection failed';
            context.db.run(
              `UPDATE ${config.table}
               SET ssh_last_test_status = ?, ssh_last_test_message = ?, ssh_last_tested_at = ?, updated_at = ?
               WHERE id = ?`,
              ['failed', message, testedAt, testedAt, id]
            );
            throw new HttpError(502, 'VPS_SSH_TEST_FAILED', message);
          }
        })
      );

      router.post(
        `/${config.route}/:id/probe/install`,
        asyncHandler(async (req, res) => {
          const id = Number(req.params.id);
          const item = getAssetOrThrow(context, config, id, { includeSecrets: true });
          const body = parseBody(probeInstallSchema, req.body ?? {}) as Record<string, unknown> & { probePort?: number; probeApiKey?: string | null };
          const actionItem = mergeActionItem(item, body);
          const probePort = body.probePort ?? numberValue(actionItem.probePort) ?? 9100;
          const probeApiKey = stringValue(body.probeApiKey) || stringValue(actionItem.probeApiKey) || generateProbeApiKey();
          const installedAt = toIsoDateTime(context.now());
          const probeUrl = buildProbeUrl(actionItem, probePort);
          try {
            const result = await executeVpsSsh(
              context,
              actionItem,
              buildProbeInstallCommand(probePort, probeApiKey),
              120_000
            );
            const message = normalizeActionMessage(result.stdout || result.stderr || 'moneypulse-probe-installed');
            context.db.run(
              `UPDATE ${config.table}
               SET probe_port = ?, probe_api_key = ?, probe_url = ?, probe_install_status = ?,
                   probe_install_message = ?, probe_installed_at = ?, updated_at = ?
               WHERE id = ?`,
              [probePort, probeApiKey || null, probeUrl, 'installed', message, installedAt, installedAt, id]
            );
            res.json({
              ok: true,
              probeUrl,
              installedAt,
              message,
              item: getAssetOrThrow(context, config, id)
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Probe install failed';
            context.db.run(
              `UPDATE ${config.table}
               SET probe_port = ?, probe_install_status = ?, probe_install_message = ?, updated_at = ?
               WHERE id = ?`,
              [probePort, 'failed', message, installedAt, id]
            );
            throw new HttpError(502, 'VPS_PROBE_INSTALL_FAILED', message);
          }
        })
      );
    }

    router.post(
      `/${config.route}`,
      asyncHandler(async (req, res) => {
        const body = enrichAssetBody(config, parseBody(config.schema, req.body) as Record<string, unknown>);
        const now = toIsoDateTime(context.now());
        const columns = [...config.fields.map((field) => field.db), 'created_at', 'updated_at'];
        const values = [...config.fields.map((field) => toDbValue(field.api, body[field.api])), now, now];
        const placeholders = columns.map(() => '?').join(', ');
        const id = context.db.insert(
          `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );
        res.status(201).json({ item: getAssetOrThrow(context, config, id) });
      })
    );

    if (config.type === 'domain') {
      router.post(
        `/${config.route}/:id/renew`,
        asyncHandler(async (req, res) => {
          const id = Number(req.params.id);
          const current = getAssetOrThrow(context, config, id);
          const cycle = normalizeBillingCycle(current.billingCycle);
          const baseDate = stringValue(current.expireDate) || stringValue(current.nextDueDate) || toIsoDate(context.now());
          const nextDate = addBillingCycle(baseDate, cycle);
          const renewedAt = toIsoDate(context.now());
          context.db.run(
            `UPDATE ${config.table} SET last_renew_date = ?, expire_date = ?, next_due_date = ?, updated_at = ? WHERE id = ?`,
            [renewedAt, nextDate, nextDate, toIsoDateTime(context.now()), id]
          );
          res.json({ item: getAssetOrThrow(context, config, id) });
        })
      );
    }

    router.put(
      `/${config.route}/:id`,
      asyncHandler(async (req, res) => {
        const current = getAssetOrThrow(context, config, Number(req.params.id), { includeSecrets: true });
        const body = preserveBlankSecrets(config, enrichAssetBody(config, parseBody(config.schema.partial(), req.body) as Record<string, unknown>, current), current);
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
        context.db.run('DELETE FROM reminder_logs WHERE asset_type = ? AND asset_id = ?', [config.type, id]);
        context.db.run(`DELETE FROM ${config.table} WHERE id = ?`, [id]);
        res.status(204).end();
      })
    );
  }
}

export function getAssetOrThrow(
  context: AppContext,
  config: AssetConfig,
  id: number,
  options: { includeSecrets?: boolean } = {}
) {
  const row = context.db.get<Record<string, unknown>>(`SELECT * FROM ${config.table} WHERE id = ?`, [id]);
  if (!row) {
    throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  }
  return mapAssetRow(config, row, options);
}

export function mapAssetRow(
  config: AssetConfig,
  row: Record<string, unknown>,
  options: { includeSecrets?: boolean } = {}
) {
  const item: Record<string, unknown> = {
    id: Number(row.id),
    assetType: config.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null
  };

  for (const field of config.fields) {
    const value = row[field.db];
    if (config.type === 'vps' && sensitiveVpsFields.has(field.api) && !options.includeSecrets) {
      item[field.api] = null;
      item[`has${capitalize(field.api)}`] = Boolean(value);
    } else if (field.api === 'autoRenew' || field.api === 'isSecondaryCard' || field.api === 'isEsim') {
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
  return value === 'quarterly' || value === 'annual' || value === 'biennial' ? value : 'monthly';
}

export function normalizeCurrency(value: unknown): Currency {
  if (value === 'USD' || value === 'GBP' || value === 'EUR') return value;
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
  if (config.type === 'phone') {
    return enrichPhoneBody(body, current);
  }

  if (config.type === 'vps') {
    return enrichVpsBody(body, current);
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

function enrichVpsBody(body: Record<string, unknown>, current?: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  const hasIpAddress = Object.prototype.hasOwnProperty.call(next, 'ipAddress');
  const hasSshHost = Object.prototype.hasOwnProperty.call(next, 'sshHost');
  const nextIpAddress = stringValue(next.ipAddress ?? current?.ipAddress);
  const currentIpAddress = stringValue(current?.ipAddress);
  const currentSshHost = stringValue(current?.sshHost);
  const sshHostWasIp = !current || !currentSshHost || currentSshHost === currentIpAddress;

  if (nextIpAddress && (!hasSshHost || !stringValue(next.sshHost)) && (!current || hasIpAddress || sshHostWasIp)) {
    next.sshHost = nextIpAddress;
  }

  return next;
}

function preserveBlankSecrets(
  config: AssetConfig,
  body: Record<string, unknown>,
  current?: Record<string, unknown>
): Record<string, unknown> {
  if (config.type !== 'vps' || !current) {
    return body;
  }
  const next = { ...body };
  for (const field of sensitiveVpsFields) {
    if (
      Object.prototype.hasOwnProperty.call(next, field) &&
      !stringValue(next[field]) &&
      stringValue(current[field])
    ) {
      delete next[field];
    }
  }
  return next;
}

function mergeActionItem(item: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const next = { ...item };
  for (const [key, value] of Object.entries(overrides)) {
    if (sensitiveVpsFields.has(key) && !stringValue(value)) continue;
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function executeVpsSsh(
  context: AppContext,
  item: Record<string, unknown>,
  command: string,
  timeoutMs: number
) {
  const options = buildSshExecOptions(item, command, timeoutMs);
  const runner = context.sshRunner ?? runSshCommand;
  return runner(options);
}

function buildSshExecOptions(
  item: Record<string, unknown>,
  command: string,
  timeoutMs: number
): SshExecOptions {
  const host = stringValue(item.sshHost) || stringValue(item.ipAddress);
  if (!host) {
    throw new HttpError(400, 'VPS_SSH_HOST_REQUIRED', 'SSH host or IP address is required');
  }
  const username = stringValue(item.sshUser) || 'root';
  const port = numberValue(item.sshPort) ?? 22;
  const authType = normalizeSshAuthType(item.sshAuthType);
  const options: SshExecOptions = {
    host,
    port,
    username,
    authType,
    command,
    timeoutMs
  };

  if (authType === 'privateKey') {
    const privateKey = stringValue(item.sshPrivateKey);
    if (!privateKey) {
      throw new HttpError(400, 'VPS_SSH_PRIVATE_KEY_REQUIRED', 'SSH private key is required');
    }
    options.privateKey = privateKey;
    const passphrase = stringValue(item.sshPrivateKeyPassphrase);
    if (passphrase) options.passphrase = passphrase;
  } else {
    const password = stringValue(item.sshPassword);
    if (!password) {
      throw new HttpError(400, 'VPS_SSH_PASSWORD_REQUIRED', 'SSH password is required');
    }
    options.password = password;
  }

  return options;
}

function normalizeSshAuthType(value: unknown): SshAuthType {
  return value === 'privateKey' ? 'privateKey' : 'password';
}

function buildProbeUrl(item: Record<string, unknown>, probePort: number): string {
  const host = stringValue(item.ipAddress) || stringValue(item.sshHost);
  if (!host) {
    throw new HttpError(400, 'VPS_PROBE_HOST_REQUIRED', 'IP address or SSH host is required');
  }
  const urlHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${urlHost}:${probePort}/api/stat`;
}

function buildProbeInstallCommand(probePort: number, probeApiKey: string): string {
  return `MONEYPULSE_PROBE_PORT=${probePort} MONEYPULSE_PROBE_TOKEN=${shellQuote(probeApiKey)} sh -s <<'MONEYPULSE_PROBE_INSTALL'
set -eu
PORT="\${MONEYPULSE_PROBE_PORT:-9100}"
TOKEN="\${MONEYPULSE_PROBE_TOKEN:-}"
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi
if ! command -v python3 >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then $SUDO apt-get update && $SUDO apt-get install -y python3
  elif command -v dnf >/dev/null 2>&1; then $SUDO dnf install -y python3
  elif command -v yum >/dev/null 2>&1; then $SUDO yum install -y python3
  elif command -v apk >/dev/null 2>&1; then $SUDO apk add --no-cache python3
  else echo "python3 is required" >&2; exit 1
  fi
fi
$SUDO mkdir -p /opt/moneypulse-probe
cat >/tmp/moneypulse-probe.py <<'PY'
import json
import os
import shutil
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("MONEYPULSE_PROBE_PORT", "9100"))
TOKEN = os.environ.get("MONEYPULSE_PROBE_TOKEN", "")
STATE = {"net": None, "time": None, "cpu": None}

def read_cpu():
    try:
        with open("/proc/stat", "r", encoding="utf-8") as fh:
            parts = [int(x) for x in fh.readline().split()[1:]]
        idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
        total = sum(parts)
        previous = STATE.get("cpu")
        STATE["cpu"] = (idle, total)
        if not previous:
            return 0
        idle_delta = idle - previous[0]
        total_delta = max(total - previous[1], 1)
        return max(0, min(1, 1 - idle_delta / total_delta))
    except Exception:
        return 0

def read_mem():
    values = {}
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as fh:
            for line in fh:
                key, raw = line.split(":", 1)
                values[key] = int(raw.strip().split()[0]) * 1024
        total = values.get("MemTotal", 0)
        available = values.get("MemAvailable", 0)
        return {"virtual": {"used": max(total - available, 0), "total": total}}
    except Exception:
        return {"virtual": {"used": 0, "total": 0}}

def read_net():
    total_in = total_out = 0
    try:
        with open("/proc/net/dev", "r", encoding="utf-8") as fh:
            for line in fh.readlines()[2:]:
                if ":" not in line:
                    continue
                name, raw = line.split(":", 1)
                if name.strip() == "lo":
                    continue
                parts = raw.split()
                total_in += int(parts[0])
                total_out += int(parts[8])
    except Exception:
        pass
    now = time.time()
    previous = STATE.get("net")
    previous_time = STATE.get("time")
    STATE["net"] = (total_in, total_out)
    STATE["time"] = now
    if previous and previous_time:
        seconds = max(now - previous_time, 1)
        delta_in = max((total_in - previous[0]) / seconds, 0)
        delta_out = max((total_out - previous[1]) / seconds, 0)
    else:
        delta_in = delta_out = 0
    return {"delta": {"in": delta_in, "out": delta_out}, "total": {"in": total_in, "out": total_out}}

def read_uptime():
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as fh:
            return float(fh.read().split()[0])
    except Exception:
        return 0

def payload():
    disk = shutil.disk_usage("/")
    load = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
    return {"stat": {
        "cpu": {"multi": read_cpu()},
        "mem": read_mem(),
        "disk": {"used": disk.used, "total": disk.total},
        "net": read_net(),
        "load": {"load1": load[0], "load5": load[1], "load15": load[2]},
        "uptime": read_uptime()
    }}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return
    def do_GET(self):
        if self.path not in ("/api/stat", "/stat"):
            self.send_response(404)
            self.end_headers()
            return
        if TOKEN:
            auth = self.headers.get("Authorization", "")
            key = self.headers.get("X-API-Key", "")
            if auth != "Bearer " + TOKEN and key != TOKEN:
                self.send_response(401)
                self.end_headers()
                return
        body = json.dumps(payload()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
PY
$SUDO mv /tmp/moneypulse-probe.py /opt/moneypulse-probe/probe.py
$SUDO chmod 0755 /opt/moneypulse-probe/probe.py
if command -v systemctl >/dev/null 2>&1; then
  cat >/tmp/moneypulse-probe.service <<SERVICE
[Unit]
Description=Moneypulse VPS probe
After=network-online.target

[Service]
Environment=MONEYPULSE_PROBE_PORT=$PORT
Environment=MONEYPULSE_PROBE_TOKEN=$TOKEN
ExecStart=/usr/bin/env python3 /opt/moneypulse-probe/probe.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE
  $SUDO mv /tmp/moneypulse-probe.service /etc/systemd/system/moneypulse-probe.service
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now moneypulse-probe.service
else
  $SUDO pkill -f /opt/moneypulse-probe/probe.py >/dev/null 2>&1 || true
  nohup env MONEYPULSE_PROBE_PORT="$PORT" MONEYPULSE_PROBE_TOKEN="$TOKEN" python3 /opt/moneypulse-probe/probe.py >/tmp/moneypulse-probe.log 2>&1 &
fi
echo moneypulse-probe-installed
MONEYPULSE_PROBE_INSTALL`;
}

function normalizeActionMessage(value: string): string {
  return value.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? '';
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function generateProbeApiKey(): string {
  return `mp_${randomBytes(24).toString('base64url')}`;
}

async function refreshVpsMonitor(
  context: AppContext,
  config: AssetConfig,
  id: number,
  item: Record<string, unknown>
): Promise<MonitorSnapshot> {
  const probeUrl = stringValue(item.probeUrl);
  if (!probeUrl) {
    throw new HttpError(400, 'VPS_PROBE_NOT_CONFIGURED', 'VPS probe URL is required');
  }

  const now = toIsoDateTime(context.now());
  let snapshot: MonitorSnapshot;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = stringValue(item.probeApiKey);
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers['X-API-Key'] = apiKey;
    }
    const client = context.fetch ?? fetch;
    const response = await client(probeUrl, { headers });
    if (!response.ok) {
      throw new Error(`Probe returned HTTP ${response.status}`);
    }
    snapshot = normalizeMonitorPayload(await response.json(), now);
  } catch {
    snapshot = offlineMonitorSnapshot(now);
  }

  context.db.run(
    `UPDATE ${config.table}
     SET monitor_status = ?,
         monitor_cpu_percent = ?,
         monitor_memory_percent = ?,
         monitor_disk_percent = ?,
         monitor_net_in_bps = ?,
         monitor_net_out_bps = ?,
         monitor_net_total_in_bytes = ?,
         monitor_net_total_out_bytes = ?,
         monitor_load1 = ?,
         monitor_uptime_seconds = ?,
         monitor_updated_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      snapshot.status,
      snapshot.cpuPercent,
      snapshot.memoryPercent,
      snapshot.diskPercent,
      snapshot.netInBps,
      snapshot.netOutBps,
      snapshot.netTotalInBytes,
      snapshot.netTotalOutBytes,
      snapshot.load1,
      snapshot.uptimeSeconds,
      snapshot.updatedAt,
      snapshot.updatedAt,
      id
    ]
  );

  return snapshot;
}

function normalizeMonitorPayload(payload: unknown, updatedAt: string): MonitorSnapshot {
  const stat = extractMonitorStat(payload);
  const cpu = asRecord(stat.cpu);
  const memory = asRecord(stat.mem) ?? asRecord(stat.memory);
  const memorySource = asRecord(memory?.virtual) ?? memory;
  const disk = asRecord(stat.disk);
  const net = asRecord(stat.net) ?? asRecord(stat.network);
  const delta = asRecord(net?.delta) ?? asRecord(net?.speed);
  const total = asRecord(net?.total);
  const load = asRecord(stat.load);

  const netInBytesPerSecond = firstNumber(delta?.['in'], delta?.download, delta?.rx, delta?.recv);
  const netOutBytesPerSecond = firstNumber(delta?.out, delta?.upload, delta?.tx, delta?.sent);

  return {
    status: 'online',
    cpuPercent: normalizePercent(firstNumber(cpu?.multi, cpu?.percent, cpu?.usage, stat.cpu)),
    memoryPercent:
      normalizePercent(firstNumber(memory?.mem, memory?.percent, memory?.usage)) ??
      percentFromUsedTotal(
        firstNumber(memorySource?.used, memorySource?.usage, memorySource?.current),
        firstNumber(memorySource?.total, memorySource?.max)
      ),
    diskPercent:
      normalizePercent(firstNumber(disk?.percent, disk?.usage)) ??
      percentFromUsedTotal(firstNumber(disk?.used), firstNumber(disk?.total)),
    netInBps: netInBytesPerSecond === null ? null : Math.round(netInBytesPerSecond * 8),
    netOutBps: netOutBytesPerSecond === null ? null : Math.round(netOutBytesPerSecond * 8),
    netTotalInBytes: firstNumber(total?.['in'], total?.download, total?.rx, total?.recv),
    netTotalOutBytes: firstNumber(total?.out, total?.upload, total?.tx, total?.sent),
    load1: firstNumber(load?.load1, load?.one, Array.isArray(stat.load) ? stat.load[0] : null),
    uptimeSeconds: firstNumber(stat.uptime, stat.uptimeSeconds),
    updatedAt
  };
}

function offlineMonitorSnapshot(updatedAt: string): MonitorSnapshot {
  return {
    status: 'offline',
    cpuPercent: null,
    memoryPercent: null,
    diskPercent: null,
    netInBps: null,
    netOutBps: null,
    netTotalInBytes: null,
    netTotalOutBytes: null,
    load1: null,
    uptimeSeconds: null,
    updatedAt
  };
}

function extractMonitorStat(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  if (!record) return {};
  const direct = asRecord(record.stat);
  if (direct) return direct;
  const data = asRecord(record.data);
  const dataStat = asRecord(data?.stat);
  if (dataStat) return dataStat;
  const server = asRecord(record.server);
  const serverStat = asRecord(server?.stat);
  if (serverStat) return serverStat;
  if (Array.isArray(record.servers)) {
    const first = asRecord(record.servers[0]);
    const firstStat = asRecord(first?.stat);
    if (firstStat) return firstStat;
  }
  return record;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function normalizePercent(value: number | null): number | null {
  if (value === null) return null;
  const percent = value >= 0 && value <= 1 ? value * 100 : value;
  return roundMetric(Math.max(0, Math.min(100, percent)));
}

function percentFromUsedTotal(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null;
  return normalizePercent(used / total);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
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
  return (['CNY', 'USD', 'GBP', 'EUR'] as Currency[]).filter((currency) => Number(values[currency] ?? 0) > 0);
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

function addBillingCycle(dateValue: string, cycle: BillingCycle): string {
  const months = cycle === 'biennial' ? 24 : cycle === 'annual' ? 12 : cycle === 'quarterly' ? 3 : 1;
  return addMonths(dateValue, months);
}

function addMonths(dateValue: string, months: number): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return dateValue;
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return [
    targetYear,
    String(targetMonthIndex + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0')
  ].join('-');
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
