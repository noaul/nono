import type { Router } from 'express';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { AppContext, DbValue } from './types.js';
import { asyncHandler, HttpError } from './http.js';
import { getSettings, type Settings } from './settings.js';
import { toIsoDateTime } from './utils.js';
import { migrateStoredSecrets } from './secret-migration.js';
import { requestOutbound } from './outbound-request.js';

type BackupRow = Record<string, unknown>;

interface BackupTable {
  key: string;
  table: string;
  columns: string[];
}

const encryptedBackupKind = 'moneypulse.webdav.encrypted';
const encryptedBackupVersion = 2;
const defaultBackupFolder = 'moneypulse';
const defaultBackupFilename = 'moneypulse-backup.json.enc';

const backupTables: BackupTable[] = [
  {
    key: 'users',
    table: 'users',
    columns: ['id', 'username', 'password_hash', 'email', 'session_version', 'created_at', 'updated_at']
  },
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
    key: 'vps',
    table: 'vps',
    columns: [
      'id', 'name', 'vps_type', 'provider', 'ip_address', 'location', 'cpu', 'memory', 'storage', 'bandwidth',
      'os', 'ssh_host', 'ssh_port', 'ssh_user', 'ssh_auth_type', 'ssh_password', 'ssh_private_key',
      'ssh_private_key_passphrase', 'ssh_host_fingerprint', 'ssh_command', 'probe_url', 'probe_port', 'probe_api_key',
      'probe_install_status', 'probe_install_message', 'probe_installed_at',
      'ssh_last_test_status', 'ssh_last_test_message', 'ssh_last_tested_at',
      'monitor_status', 'monitor_cpu_percent', 'monitor_memory_percent', 'monitor_disk_percent',
      'monitor_net_in_bps', 'monitor_net_out_bps', 'monitor_net_total_in_bytes',
      'monitor_net_total_out_bytes', 'monitor_load1', 'monitor_uptime_seconds', 'monitor_updated_at',
      'amount_minor_units', 'currency', 'billing_cycle', 'start_date', 'next_due_date',
      'expire_date', 'auto_renew', 'payment_method', 'renewal_url', 'status', 'tags', 'notes',
      'created_at', 'updated_at', 'archived_at'
    ]
  },
  {
    key: 'domains',
    table: 'domains',
    columns: [
      'id', 'domain_name', 'registrar', 'registrar_account', 'registrar_url', 'dns_provider',
      'purpose', 'register_date', 'last_renew_date', 'domain_extension', 'rarity_score', 'next_due_date', 'expire_date',
      'amount_minor_units', 'currency', 'billing_cycle', 'auto_renew', 'payment_method', 'renewal_url',
      'status', 'tags', 'notes', 'created_at', 'updated_at', 'archived_at'
    ]
  },
  {
    key: 'subscriptions',
    table: 'subscriptions',
    columns: [
      'id', 'name', 'purchase_type', 'provider', 'account', 'category', 'email', 'phone_number',
      'license_key', 'device_limit', 'content', 'amount_minor_units', 'currency',
      'billing_cycle', 'next_due_date', 'auto_renew', 'payment_method', 'renewal_url',
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
    columns: [
      'id', 'asset_type', 'asset_id', 'amount_minor_units', 'currency', 'paid_at',
      'period_start', 'period_end', 'category', 'notes', 'created_at', 'updated_at'
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
    columns: [
      'id', 'run_id', 'asset_type', 'asset_id', 'due_date', 'days_before', 'sent_at', 'status', 'error_message'
    ]
  }
];

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

export function buildBackupPayload(context: AppContext): Record<string, unknown> {
  return {
    version: 1,
    exportedAt: toIsoDateTime(context.now()),
    users: selectTable(context, 'users'),
    phones: selectTable(context, 'phones'),
    vps: selectTable(context, 'vps'),
    domains: selectTable(context, 'domains'),
    subscriptions: selectTable(context, 'subscriptions'),
    accounts: selectTable(context, 'accounts'),
    expenses: selectTable(context, 'expenses'),
    settings: selectTable(context, 'settings', 'key'),
    reminderLogs: selectTable(context, 'reminder_logs')
  };
}

export function buildEncryptedBackupEnvelope(context: AppContext): Record<string, unknown> {
  return encryptBackupPayload(buildBackupPayload(context), getSettings(context));
}

export function restoreBackupPayload(context: AppContext, payload: Record<string, unknown>): Record<string, number> {
  const counts: Record<string, number> = {};
  context.db.exec('BEGIN');
  try {
    for (const table of backupTables) {
      const rows = getBackupRows(payload, table.key);
      if (!rows) {
        continue;
      }
      context.db.run(`DELETE FROM ${table.table}`);
      for (const row of rows) {
        insertBackupRow(context, table, row);
      }
      counts[table.key] = rows.length;
    }
    migrateStoredSecrets(context);
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }
  return counts;
}

function selectTable(context: AppContext, table: string, orderColumn = 'id'): BackupRow[] {
  return context.db.all(`SELECT * FROM ${table} ORDER BY ${orderColumn} ASC`);
}

function tableCounts(payload: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    backupTables.map((table) => {
      const rows = payload[table.key];
      return [table.key, Array.isArray(rows) ? rows.length : 0];
    })
  );
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
    throw new HttpError(400, 'INVALID_BACKUP', error instanceof Error ? error.message : 'Invalid backup');
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
