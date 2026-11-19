import type { Router } from 'express';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { productAssetTypes, type AppContext, type AssetType, type DbValue } from './types.js';
import { asyncHandler, HttpError } from './http.js';
import { decryptSecret, isEncryptedSecret } from './secret-crypto.js';
import { getSettings, sensitiveSettingKeys, type Settings } from './settings.js';
import { toIsoDateTime } from './utils.js';
import { migrateStoredSecrets } from './secret-migration.js';
import { requestOutbound } from './outbound-request.js';
import { requireInternalToken } from './renewals.js';
import { invalidateDatabaseGeneration } from './db.js';
import { yumiMergeSetting } from './yumi-merge.js';

type BackupRow = Record<string, unknown>;

interface BackupTable {
  key: string;
  table: string;
  columns: string[];
  /** Rows are scoped by `asset_type`; only the types the payload carries are replaced. */
  assetTyped?: boolean;
}

const encryptedBackupKind = 'moneypulse.webdav.encrypted';
const encryptedBackupVersion = 2;
const defaultBackupFolder = 'moneypulse';
const defaultBackupFilename = 'moneypulse-backup.json.enc';

const backupTables: BackupTable[] = [
  {
    key: 'phones',
    table: 'phones',
    columns: [
      'id', 'phone_type', 'card_number', 'po_phone_number', 'carrier', 'plan_name', 'real_name_person',
      'is_esim',
      'user_name', 'is_secondary_card', 'data_allowance_gb', 'voice_minutes', 'monthly_rent_minor_units',
      'attached_services', 'attached_services_minor_units', 'discount_minor_units', 'cashback_minor_units', 'country_code', 'home_location',
      'a_phone_number', 'mainland_number', 'real_name_method', 'balance_minor_units', 'total_keepalive_until',
      'keepalive_method', 'minimum_keepalive_amount_minor_units', 'keepalive_days',
      'amount_minor_units', 'currency', 'billing_cycle', 'billing_day', 'activate_date', 'next_due_date', 'expire_date', 'auto_renew', 'payment_method',
      'renewal_url', 'status', 'tags', 'notes', 'created_at', 'updated_at', 'archived_at'
    ]
  },
  {
    key: 'domains',
    table: 'domains',
    columns: [
      'id', 'domain_name', 'registrar', 'registrar_account', 'registrar_url', 'dns_provider',
      'rdap_expire_date', 'rdap_checked_at', 'rdap_error', 'ssl_expires_at', 'ssl_issuer', 'ssl_checked_at', 'ssl_error',
      'purpose', 'register_date', 'last_renew_date', 'domain_extension', 'rarity_score', 'next_due_date', 'expire_date',
      'amount_minor_units', 'currency', 'billing_cycle', 'billing_day', 'auto_renew', 'payment_method', 'renewal_url',
      'status', 'tags', 'notes', 'created_at', 'updated_at', 'archived_at'
    ]
  },
  {
    key: 'subscriptions',
    table: 'subscriptions',
    columns: [
      'id', 'name', 'purchase_type', 'provider', 'account', 'category', 'email', 'phone_number',
      'license_key', 'device_limit', 'content', 'amount_minor_units', 'currency',
      'billing_cycle', 'billing_day', 'next_due_date', 'auto_renew', 'payment_method', 'renewal_url',
      'status', 'tags', 'notes', 'created_at', 'updated_at', 'archived_at'
    ]
  },
  {
    key: 'accounts',
    table: 'accounts',
    columns: [
      'id', 'account_type', 'phone_number', 'phone_key', 'country_calling_code', 'country_iso',
      'bound_email', 'login_device', 'display_name', 'notes', 'created_at', 'updated_at', 'archived_at'
    ]
  },
  {
    key: 'expenses',
    table: 'expenses',
    assetTyped: true,
    columns: [
      'id', 'asset_type', 'asset_id', 'amount_minor_units', 'currency', 'paid_at',
      'period_start', 'period_end', 'category', 'notes', 'created_at', 'updated_at'
    ]
  },
  {
    key: 'renewalEvents',
    table: 'renewal_events',
    assetTyped: true,
    columns: [
      'id', 'request_id', 'asset_type', 'asset_id', 'previous_expire_date', 'previous_next_due_date', 'previous_last_renew_date',
      'renewed_expire_date', 'expense_id', 'amount_minor_units', 'currency', 'status', 'created_at', 'undone_at'
    ]
  },
  {
    key: 'settings',
    table: 'settings',
    columns: ['key', 'value']
  },
  {
    key: 'reminderLogs',
    table: 'reminder_logs',
    assetTyped: true,
    columns: [
      'id', 'run_id', 'asset_type', 'asset_id', 'due_date', 'days_before', 'sent_at', 'status', 'error_message', 'kind'
    ]
  }
];

/** The payload key that holds each asset type's rows. */
const assetTableKeys: Record<AssetType, string> = { phone: 'phones', domain: 'domains', subscription: 'subscriptions' };

export function registerBackupRoutes(router: Router, context: AppContext): void {
  router.post(
    '/backup/webdav',
    asyncHandler(async (_req, res) => {
      const settings = getSettings(context);
      const target = buildWebdavTarget(settings);
      const payload = buildBackupPayload(context);
      const body = JSON.stringify(encryptBackupPayload(payload, settings), null, 2);
      const response = await requestWebdav(context, settings, target, 'PUT', body);
      if (!response.ok) {
        throw new HttpError(502, 'WEBDAV_BACKUP_FAILED', `WebDAV backup failed with HTTP ${response.status}`);
      }
      res.json({
        ok: true,
        target,
        bytes: Buffer.byteLength(body, 'utf8'),
        counts: tableCounts(payload)
      });
    })
  );

  router.post(
    '/backup/restore',
    asyncHandler(async (_req, res) => {
      const settings = getSettings(context);
      const target = buildWebdavTarget(settings);
      const response = await requestWebdav(context, settings, target, 'GET');
      if (!response.ok) {
        throw new HttpError(502, 'WEBDAV_RESTORE_FAILED', `WebDAV restore failed with HTTP ${response.status}`);
      }
      const payload = parseBackupPayload(await response.text(), settings);
      const counts = restoreBackupPayload(context, payload);
      res.json({ ok: true, target, counts });
    })
  );
}

/** Restores from a backup file the user downloaded earlier (encrypted or plain JSON). */
export function registerBackupUploadRoute(router: Router, context: AppContext): void {
  router.post('/backup/restore-file', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new HttpError(400, 'INVALID_BACKUP', 'Backup must be a JSON object');
    }
    const payload = parseBackupPayload(JSON.stringify(req.body), getSettings(context));
    res.json({ ok: true, counts: restoreBackupPayload(context, payload) });
  });
}

export function registerInternalBackupRoutes(router: Router, context: AppContext): void {
  router.get('/internal/backup', requireInternalToken(context), (_req, res) => {
    res.json(buildBackupPayload(context));
  });

  router.post('/internal/backup/restore', requireInternalToken(context), (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new HttpError(400, 'INVALID_BACKUP', 'Backup must be a JSON object');
    }
    res.json({ ok: true, counts: restoreBackupPayload(context, req.body as Record<string, unknown>) });
  });
}

export function buildBackupPayload(context: AppContext): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    version: 3,
    product: 'nomoney',
    exportedAt: toIsoDateTime(context.now()),
  };
  for (const table of backupTables) {
    payload[table.key] = selectBackupTable(context, table);
  }
  return payload;
}

export function buildEncryptedBackupEnvelope(context: AppContext): Record<string, unknown> {
  return encryptBackupPayload(buildBackupPayload(context), getSettings(context));
}

export function restoreBackupPayload(context: AppContext, payload: Record<string, unknown>): Record<string, number> {
  const payloadProduct = payload.product;
  if (payloadProduct === 'yumi') {
    throw new HttpError(400, 'BACKUP_PRODUCT_MISMATCH', 'Yumi has been retired and its domains now live in NoMoney; a Yumi backup cannot be restored here');
  }
  if (payloadProduct !== undefined && payloadProduct !== 'nomoney') {
    throw new HttpError(400, 'BACKUP_PRODUCT_MISMATCH', `Backup belongs to ${String(payloadProduct)} and cannot be restored into NoMoney`);
  }
  // Validate protected columns before touching live data; ciphertext belongs to the
  // application key that created it, independently of the WebDAV envelope password.
  const validateSecret = (value: unknown): void => {
    if (typeof value !== 'string' || !isEncryptedSecret(value)) return;
    try { decryptSecret(value, context.encryptionKey); }
    catch { throw new HttpError(400, 'BACKUP_SECRET_KEY_MISMATCH', 'Backup contains credentials encrypted with a different application key; restore with the original encryption key'); }
  };
  for (const row of getBackupRows(payload, 'settings') || []) {
    if (!(sensitiveSettingKeys as readonly string[]).includes(String(row.key))) continue;
    let value = row.value;
    try { value = JSON.parse(String(value)); } catch { /* Legacy settings were stored as raw text. */ }
    validateSecret(value);
  }
  for (const row of getBackupRows(payload, 'subscriptions') || []) validateSecret(row.license_key);

  // Backups made while domains lived in Yumi carry no `domains` table. Their ledger rows
  // only replace the asset types the payload actually contains, so restoring one keeps
  // today's domains and their history. VPS rows from older backups are dropped: VPS is retired.
  const restoredTypes = productAssetTypes.filter((type) => Array.isArray(payload[assetTableKeys[type]]));
  // The Yumi merge marker describes this database, not the backup; restoring must not re-arm it.
  const mergeMarker = context.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [yumiMergeSetting]);
  const counts: Record<string, number> = {};
  context.db.exec('BEGIN');
  try {
    for (const table of backupTables) {
      const rows = getBackupRows(payload, table.key);
      if (!rows) {
        if (table.key === 'renewalEvents') deleteBackupRows(context, table, restoredTypes);
        continue;
      }
      deleteBackupRows(context, table, restoredTypes);
      const scoped = table.assetTyped ? rows.filter((row) => (restoredTypes as readonly string[]).includes(String(row.asset_type))) : rows;
      for (const row of scoped) {
        insertBackupRow(context, table, row);
      }
      counts[table.key] = scoped.length;
    }
    if (mergeMarker) context.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [yumiMergeSetting, mergeMarker.value]);
    context.db.run("DELETE FROM settings WHERE key IN ('productMode', 'statusSampleMinutes', 'statusRetentionDays', 'yumiMigrationVersion', 'yumiSplitFinalized', 'outageAlertsEnabled', 'diskAlertPercent')");
    migrateStoredSecrets(context);
    context.db.exec('COMMIT');
    invalidateDatabaseGeneration(context.db);
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }
  return counts;
}

function selectBackupTable(context: AppContext, table: BackupTable): BackupRow[] {
  const orderColumn = table.table === 'settings' ? 'key' : 'id';
  return context.db.all(`SELECT * FROM ${table.table} ORDER BY ${orderColumn} ASC`);
}

function tableCounts(payload: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    backupTables.map((table) => {
      const rows = payload[table.key];
      return [table.key, Array.isArray(rows) ? rows.length : 0];
    })
  );
}

function deleteBackupRows(context: AppContext, table: BackupTable, assetTypes: readonly AssetType[]): void {
  if (!table.assetTyped) {
    context.db.run(`DELETE FROM ${table.table}`);
    return;
  }
  if (!assetTypes.length) return;
  context.db.run(`DELETE FROM ${table.table} WHERE asset_type IN (${assetTypes.map(() => '?').join(', ')})`, [...assetTypes]);
}

function buildWebdavTarget(settings: Settings): string {
  if (!settings.webdavUrl.trim()) {
    throw new HttpError(400, 'WEBDAV_NOT_CONFIGURED', 'WebDAV URL is required');
  }
  const base = new URL(settings.webdavUrl.endsWith('/') ? settings.webdavUrl : `${settings.webdavUrl}/`);
  const path = resolveWebdavBackupPath(settings);
  for (const segment of path.split('/').filter(Boolean)) {
    base.pathname = `${base.pathname.replace(/\/$/, '')}/${encodeURIComponent(segment)}`;
  }
  return base.toString();
}

function resolveWebdavBackupPath(settings: Settings): string {
  const legacyPath = trimSlashes(settings.webdavPath);
  const legacySegments = splitPath(legacyPath);
  const hasModernPath = Boolean(settings.webdavFolderPath.trim() || settings.webdavBackupFilename.trim());
  const folder = hasModernPath
    ? trimSlashes(settings.webdavFolderPath) || legacySegments.slice(0, -1).join('/') || defaultBackupFolder
    : legacySegments.slice(0, -1).join('/') || defaultBackupFolder;
  const filename = hasModernPath
    ? trimSlashes(settings.webdavBackupFilename) || legacySegments.at(-1) || defaultBackupFilename
    : legacySegments.at(-1) || defaultBackupFilename;
  return [...splitPath(folder), ...splitPath(filename)].join('/');
}

function splitPath(value: string): string[] {
  return value.split('/').map((segment) => segment.trim()).filter(Boolean);
}

function trimSlashes(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

async function requestWebdav(
  context: AppContext,
  settings: Settings,
  url: string,
  method: 'GET' | 'PUT',
  body?: string
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (settings.webdavUsername || settings.webdavPassword) {
    headers.Authorization = `Basic ${Buffer.from(`${settings.webdavUsername}:${settings.webdavPassword}`).toString('base64')}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return requestOutbound(context, url, { method, headers, body }, {
    maxBytes: method === 'GET' ? 32 * 1024 * 1024 : 256 * 1024,
    timeoutMs: 10_000
  });
}

function parseBackupPayload(text: string, settings: Settings): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Backup must be a JSON object');
    }
    if (isEncryptedBackup(parsed)) {
      return decryptBackupPayload(parsed, settings);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, 'INVALID_BACKUP', error instanceof Error && /authenticate|bad decrypt|Unsupported state|final/i.test(error.message)
      ? 'Backup encryption key does not match this backup'
      : error instanceof Error ? error.message : 'Invalid backup');
  }
}

function encryptBackupPayload(payload: Record<string, unknown>, settings: Settings): Record<string, unknown> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveBackupKey(settings, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: encryptedBackupVersion,
    kind: encryptedBackupKind,
    exportedAt: payload.exportedAt,
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptBackupPayload(envelope: Record<string, unknown>, settings: Settings): Record<string, unknown> {
  const salt = decodeEnvelopeField(envelope.salt, 'salt');
  const iv = decodeEnvelopeField(envelope.iv, 'iv');
  const tag = decodeEnvelopeField(envelope.tag, 'tag');
  const ciphertext = decodeEnvelopeField(envelope.ciphertext, 'ciphertext');
  const key = deriveBackupKey(settings, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Decrypted backup must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function deriveBackupKey(settings: Settings, salt: Buffer): Buffer {
  const secret = settings.webdavEncryptionKey.trim() || settings.webdavPassword.trim();
  if (!secret) {
    throw new HttpError(400, 'WEBDAV_ENCRYPTION_KEY_REQUIRED', 'WebDAV backup encryption key is required');
  }
  return scryptSync(secret, salt, 32);
}

function decodeEnvelopeField(value: unknown, field: string): Buffer {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Encrypted backup is missing ${field}`);
  }
  return Buffer.from(value, 'base64');
}

function isEncryptedBackup(value: Record<string, unknown>): boolean {
  return value.kind === encryptedBackupKind && value.version === encryptedBackupVersion;
}

function getBackupRows(payload: Record<string, unknown>, key: string): BackupRow[] | null {
  const value = payload[key];
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_BACKUP', `Backup table ${key} must be an array`);
  }
  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new HttpError(400, 'INVALID_BACKUP', `Backup table ${key} contains an invalid row`);
    }
    return row as BackupRow;
  });
}

function insertBackupRow(context: AppContext, table: BackupTable, row: BackupRow): void {
  const columns = table.columns.filter((column) => Object.prototype.hasOwnProperty.call(row, column));
  if (columns.length === 0) {
    return;
  }
  const values = columns.map((column) => toDbValue(row[column]));
  const placeholders = columns.map(() => '?').join(', ');
  context.db.run(`INSERT INTO ${table.table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
}

function toDbValue(value: unknown): DbValue {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return JSON.stringify(value);
}
