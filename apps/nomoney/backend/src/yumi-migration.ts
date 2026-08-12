import fs from 'node:fs';
import path from 'node:path';
import { createDatabase } from './db.js';
import { decryptSecret, encryptSecret } from './secret-crypto.js';
import type { DbClient, DbValue } from './types.js';

const migrationVersion = 1;
const migrationSetting = 'yumiMigrationVersion';
const secretColumns = ['ssh_password', 'ssh_private_key', 'ssh_private_key_passphrase', 'probe_api_key'];

export interface YumiMigrationOptions {
  sourcePath: string;
  targetPath: string;
  sourceEncryptionKey: string;
  targetEncryptionKey: string;
}

interface DatabaseWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export async function waitForDatabaseFile(sourcePath: string, options: DatabaseWaitOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(sourcePath)) {
    if (Date.now() >= deadline) {
      throw new Error(`NoMoney source database is unavailable after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function migrateYumiData(options: YumiMigrationOptions) {
  if (!fs.existsSync(options.sourcePath)) throw new Error('NoMoney source database is unavailable');
  if (fs.existsSync(options.targetPath)) {
    const existing = await createDatabase({ persist: true, filePath: options.targetPath, product: 'yumi' });
    const version = settingNumber(existing, migrationSetting);
    if (version === migrationVersion) {
      return { migrated: false, alreadyCurrent: true, counts: migrationCounts(existing) };
    }
    throw new Error('Yumi target database exists without a supported migration marker');
  }

  fs.mkdirSync(path.dirname(options.targetPath), { recursive: true });
  const temporaryPath = `${options.targetPath}.${process.pid}.migration.tmp`;
  const sourceSnapshotPath = `${options.targetPath}.${process.pid}.source.tmp`;
  fs.rmSync(temporaryPath, { force: true });
  fs.rmSync(sourceSnapshotPath, { force: true });
  try {
    fs.copyFileSync(options.sourcePath, sourceSnapshotPath);
    const source = await createDatabase({ persist: true, filePath: sourceSnapshotPath, product: 'nomoney' });
    const target = await createDatabase({ persist: true, filePath: temporaryPath, product: 'yumi' });
    target.exec('BEGIN');
    try {
      copyTable(source, target, 'users');
      copyTable(source, target, 'settings', undefined, (row) => reencryptSettingRow(row, options));
      copyTable(source, target, 'vps', undefined, (row) => reencryptVpsRow(row, options));
      copyTable(source, target, 'domains');
      copyTable(source, target, 'expenses', "asset_type IN ('vps', 'domain')");
      copyTable(source, target, 'renewal_events', "asset_type IN ('vps', 'domain')");
      copyTable(source, target, 'reminder_logs', "asset_type IN ('vps', 'domain')");
      target.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [migrationSetting, JSON.stringify(migrationVersion)]);
      target.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['productMode', JSON.stringify('yumi')]);
      assertRelationships(target);
      target.exec('COMMIT');
    } catch (error) {
      target.exec('ROLLBACK');
      throw error;
    }
    target.save();
    const counts = migrationCounts(target);
    assertCounts(source, counts);
    fs.renameSync(temporaryPath, options.targetPath);
    return { migrated: true, alreadyCurrent: false, counts };
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  } finally {
    fs.rmSync(sourceSnapshotPath, { force: true });
  }
}

export async function finalizeNoMoneySplit(sourcePath: string) {
  if (!fs.existsSync(sourcePath)) throw new Error('NoMoney source database is unavailable');
  const source = await createDatabase({ persist: true, filePath: sourcePath, product: 'nomoney' });
  source.exec('BEGIN');
  try {
    source.run("DELETE FROM reminder_logs WHERE asset_type IN ('vps', 'domain')");
    source.run("DELETE FROM renewal_events WHERE asset_type IN ('vps', 'domain')");
    source.run("DELETE FROM expenses WHERE asset_type IN ('vps', 'domain')");
    source.run('DELETE FROM vps_status_samples');
    source.run('DELETE FROM vps_status_daily');
    source.run('DELETE FROM vps');
    source.run('DELETE FROM domains');
    source.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['yumiSplitFinalized', JSON.stringify(true)]);
    source.exec('COMMIT');
  } catch (error) {
    source.exec('ROLLBACK');
    throw error;
  }
  return { finalized: true };
}

function copyTable(
  source: DbClient,
  target: DbClient,
  table: string,
  where?: string,
  transform: (row: Record<string, unknown>) => Record<string, unknown> = (row) => row
): void {
  const sourceColumns = source.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name);
  const targetColumns = new Set(target.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name));
  const columns = sourceColumns.filter((column) => targetColumns.has(column));
  if (!columns.length) return;
  target.run(`DELETE FROM ${table}`);
  const rows = source.all<Record<string, unknown>>(`SELECT ${columns.join(', ')} FROM ${table}${where ? ` WHERE ${where}` : ''} ORDER BY ${columns.includes('id') ? 'id' : columns[0]}`);
  for (const original of rows) {
    const row = transform(original);
    const values = columns.map((column) => toDbValue(row[column]));
    target.run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
  }
}

function reencryptVpsRow(row: Record<string, unknown>, options: YumiMigrationOptions) {
  const migrated = { ...row };
  for (const column of secretColumns) {
    const value = migrated[column];
    if (typeof value === 'string' && value) {
      migrated[column] = encryptSecret(decryptSecret(value, options.sourceEncryptionKey), options.targetEncryptionKey);
    }
  }
  return migrated;
}

function reencryptSettingRow(row: Record<string, unknown>, options: YumiMigrationOptions) {
  if (['webdavPath', 'webdavBackupFilename'].includes(String(row.key))) {
    return { ...row, value: JSON.stringify('yumi-backup.json.enc') };
  }
  if (!['webdavPassword', 'webdavEncryptionKey'].includes(String(row.key))) return row;
  try {
    const stored = JSON.parse(String(row.value ?? '""'));
    if (typeof stored !== 'string' || !stored) return row;
    return {
      ...row,
      value: JSON.stringify(encryptSecret(decryptSecret(stored, options.sourceEncryptionKey), options.targetEncryptionKey))
    };
  } catch {
    throw new Error(`Yumi migration could not re-encrypt setting ${String(row.key)}`);
  }
}

function assertRelationships(db: DbClient): void {
  const orphanExpenses = db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM expenses e
     WHERE (e.asset_type = 'vps' AND NOT EXISTS (SELECT 1 FROM vps WHERE id = e.asset_id))
        OR (e.asset_type = 'domain' AND NOT EXISTS (SELECT 1 FROM domains WHERE id = e.asset_id))`
  );
  const orphanRenewals = db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM renewal_events r
     WHERE (r.asset_type = 'vps' AND NOT EXISTS (SELECT 1 FROM vps WHERE id = r.asset_id))
        OR (r.asset_type = 'domain' AND NOT EXISTS (SELECT 1 FROM domains WHERE id = r.asset_id))
        OR (r.expense_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expenses WHERE id = r.expense_id))`
  );
  if (Number(orphanExpenses?.count) || Number(orphanRenewals?.count)) {
    throw new Error('Yumi migration relationship validation failed');
  }
}

function assertCounts(source: DbClient, actual: ReturnType<typeof migrationCounts>): void {
  const expected = {
    users: count(source, 'users'),
    vps: count(source, 'vps'),
    domains: count(source, 'domains'),
    expenses: filteredCount(source, 'expenses'),
    renewalEvents: filteredCount(source, 'renewal_events'),
    reminderLogs: filteredCount(source, 'reminder_logs')
  };
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`Yumi migration count validation failed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function migrationCounts(db: DbClient) {
  return {
    users: count(db, 'users'),
    vps: count(db, 'vps'),
    domains: count(db, 'domains'),
    expenses: count(db, 'expenses'),
    renewalEvents: count(db, 'renewal_events'),
    reminderLogs: count(db, 'reminder_logs')
  };
}

function filteredCount(db: DbClient, table: string): number {
  return Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE asset_type IN ('vps', 'domain')`)?.count ?? 0);
}

function count(db: DbClient, table: string): number {
  return Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0);
}

function settingNumber(db: DbClient, key: string): number {
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  try { return Number(JSON.parse(row?.value ?? '0')); } catch { return 0; }
}

function toDbValue(value: unknown): DbValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value);
}
