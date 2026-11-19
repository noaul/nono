import fs from 'node:fs';
import { createDatabase } from './db.js';
import type { DbClient, DbValue } from './types.js';

/**
 * Yumi, the separate product that held domains and VPS for a while, is retired. Its database
 * stays on disk; on first start NoMoney takes the domains back together with their expenses,
 * renewals and reminder history. VPS data is not carried over.
 *
 * The domains NoMoney still holds from before the split are stale copies, so they are replaced.
 * The marker lives in the NoMoney database and is written in the same transaction, which makes
 * the merge run exactly once. Nothing in the Yumi database is changed.
 */
export const yumiMergeSetting = 'yumiMergeVersion';
const mergeVersion = 1;

type Row = Record<string, unknown>;

export interface YumiMergeCounts {
  domains: number;
  expenses: number;
  renewalEvents: number;
  reminderLogs: number;
}

export type YumiMergeResult =
  | { merged: true; counts: YumiMergeCounts }
  | { merged: false; reason: 'already-merged' | 'no-source' | 'source-not-yumi' };

export async function mergeYumiDomains(target: DbClient, sourcePath: string): Promise<YumiMergeResult> {
  if (settingNumber(target, yumiMergeSetting) === mergeVersion) return { merged: false, reason: 'already-merged' };
  if (!sourcePath || !fs.existsSync(sourcePath)) return { merged: false, reason: 'no-source' };

  const source = await createDatabase({ filePath: sourcePath, persist: false, readOnly: true });
  if (!hasTable(source, 'domains') || settingString(source, 'productMode') !== 'yumi') {
    return { merged: false, reason: 'source-not-yumi' };
  }

  const domains = source.all<Row>('SELECT * FROM domains ORDER BY id');
  const expenses = source.all<Row>("SELECT * FROM expenses WHERE asset_type = 'domain' ORDER BY id");
  const renewals = source.all<Row>("SELECT * FROM renewal_events WHERE asset_type = 'domain' ORDER BY id");
  const reminders = hasTable(source, 'reminder_logs')
    ? source.all<Row>("SELECT * FROM reminder_logs WHERE asset_type = 'domain' ORDER BY id")
    : [];

  target.exec('BEGIN');
  try {
    target.run("DELETE FROM reminder_logs WHERE asset_type = 'domain'");
    target.run("DELETE FROM renewal_events WHERE asset_type = 'domain'");
    target.run("DELETE FROM expenses WHERE asset_type = 'domain'");
    target.run('DELETE FROM domains');

    // Domains keep their ids, so every ledger row still points at the right domain.
    const domainColumns = sharedColumns(source, target, 'domains');
    for (const row of domains) insertRow(target, 'domains', domainColumns, row);

    // Ledger ids overlap with NoMoney's own rows, so they are reassigned and the renewal
    // events' expense links follow the new ids.
    const expenseIds = new Map<number, number>();
    const expenseColumns = sharedColumns(source, target, 'expenses').filter((column) => column !== 'id');
    for (const row of expenses) expenseIds.set(Number(row.id), insertRow(target, 'expenses', expenseColumns, row));

    const renewalColumns = sharedColumns(source, target, 'renewal_events').filter((column) => column !== 'id');
    for (const row of renewals) {
      const expenseId = row.expense_id === null || row.expense_id === undefined ? null : expenseIds.get(Number(row.expense_id)) ?? null;
      insertRow(target, 'renewal_events', renewalColumns, { ...row, expense_id: expenseId });
    }

    const reminderColumns = hasTable(source, 'reminder_logs')
      ? sharedColumns(source, target, 'reminder_logs').filter((column) => column !== 'id')
      : [];
    for (const row of reminders) insertRow(target, 'reminder_logs', reminderColumns, row, 'INSERT OR IGNORE');

    const counts: YumiMergeCounts = {
      domains: count(target, 'SELECT COUNT(*) AS count FROM domains'),
      expenses: count(target, "SELECT COUNT(*) AS count FROM expenses WHERE asset_type = 'domain'"),
      renewalEvents: count(target, "SELECT COUNT(*) AS count FROM renewal_events WHERE asset_type = 'domain'"),
      reminderLogs: count(target, "SELECT COUNT(*) AS count FROM reminder_logs WHERE asset_type = 'domain'")
    };
    if (counts.domains !== domains.length || counts.expenses !== expenses.length || counts.renewalEvents !== renewals.length) {
      throw new Error(`Yumi domain merge count check failed: ${JSON.stringify(counts)}`);
    }
    const orphans = count(
      target,
      `SELECT COUNT(*) AS count FROM expenses e
       WHERE e.asset_type = 'domain' AND NOT EXISTS (SELECT 1 FROM domains WHERE id = e.asset_id)`
    );
    if (orphans) throw new Error(`Yumi domain merge found ${orphans} expenses without a domain`);

    target.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [yumiMergeSetting, JSON.stringify(mergeVersion)]);
    target.exec('COMMIT');
    return { merged: true, counts };
  } catch (error) {
    target.exec('ROLLBACK');
    throw error;
  }
}

function sharedColumns(source: DbClient, target: DbClient, table: string): string[] {
  const targetColumns = new Set(columnsOf(target, table));
  return columnsOf(source, table).filter((column) => targetColumns.has(column));
}

function columnsOf(db: DbClient, table: string): string[] {
  return db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name);
}

function insertRow(db: DbClient, table: string, columns: string[], row: Row, verb = 'INSERT'): number {
  return db.insert(
    `${verb} INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => toDbValue(row[column]))
  );
}

function hasTable(db: DbClient, table: string): boolean {
  return Boolean(db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]));
}

function count(db: DbClient, sql: string): number {
  return Number(db.get<{ count: number }>(sql)?.count ?? 0);
}

function settingValue(db: DbClient, key: string): unknown {
  if (!hasTable(db, 'settings')) return undefined;
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  try { return JSON.parse(row?.value ?? 'null'); } catch { return row?.value; }
}

function settingNumber(db: DbClient, key: string): number {
  return Number(settingValue(db, key) ?? 0);
}

function settingString(db: DbClient, key: string): string {
  const value = settingValue(db, key);
  return typeof value === 'string' ? value : '';
}

function toDbValue(value: unknown): DbValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value);
}
