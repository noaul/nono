import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDatabase } from './db.js';
import { mergeYumiDomains } from './yumi-merge.js';
import type { DbClient } from './types.js';

let directory: string;
let sourcePath: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nomoney-yumi-merge-'));
  sourcePath = path.join(directory, 'yumi', 'app.db');
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

const stamp = '2026-01-01T00:00:00.000Z';

function insertDomain(db: DbClient, id: number, name: string, expireDate: string) {
  db.run(
    `INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, expire_date, next_due_date, status, tags, created_at, updated_at)
     VALUES (?, ?, 1200, 'USD', 'annual', ?, ?, 'active', '[]', ?, ?)`,
    [id, name, expireDate, expireDate, stamp, stamp]
  );
}

function insertExpense(db: DbClient, id: number, assetType: string, assetId: number, amount: number) {
  db.run(
    `INSERT INTO expenses (id, asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'USD', '2026-03-01', 'renewal', ?, ?)`,
    [id, assetType, assetId, amount, stamp, stamp]
  );
}

function insertRenewal(db: DbClient, requestId: string, assetType: string, assetId: number, expenseId: number | null) {
  db.run(
    `INSERT INTO renewal_events (request_id, asset_type, asset_id, previous_expire_date, renewed_expire_date, expense_id, amount_minor_units, currency, status, created_at)
     VALUES (?, ?, ?, '2026-03-01', '2027-03-01', ?, 1200, 'USD', 'active', ?)`,
    [requestId, assetType, assetId, expenseId, stamp]
  );
}

/** A Yumi database as the retired Yumi process left it. */
async function createYumiSource() {
  const yumi = await createDatabase({ filePath: sourcePath, persist: true });
  yumi.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('productMode', '\"yumi\"')");
  insertDomain(yumi, 4, 'live.example', '2027-03-01');
  insertDomain(yumi, 9, 'archived.example', '2026-09-01');
  yumi.run("UPDATE domains SET archived_at = ?, status = 'archived' WHERE id = 9", [stamp]);
  insertExpense(yumi, 1, 'domain', 4, 1200);
  insertExpense(yumi, 2, 'vps', 1, 500);
  insertExpense(yumi, 3, 'domain', 9, 900);
  insertRenewal(yumi, 'renew-live', 'domain', 4, 1);
  insertRenewal(yumi, 'renew-vps', 'vps', 1, 2);
  yumi.run(
    `INSERT INTO reminder_logs (run_id, asset_type, asset_id, due_date, days_before, sent_at, status, kind)
     VALUES ('run', 'domain', 4, '2027-03-01', 30, ?, 'sent', 'renewal')`,
    [stamp]
  );
  return yumi;
}

/** A NoMoney database still holding the stale domain copy from before the split. */
async function createNoMoneyTarget() {
  const target = await createDatabase({ filePath: path.join(directory, 'nomoney', 'app.db'), persist: true });
  target.run(
    `INSERT INTO phones (id, card_number, amount_minor_units, currency, billing_cycle, status, created_at, updated_at)
     VALUES (1, '13800138000', 1000, 'CNY', 'monthly', 'active', ?, ?)`,
    [stamp, stamp]
  );
  insertDomain(target, 4, 'live.example', '2026-03-01');
  insertDomain(target, 5, 'deleted-in-yumi.example', '2026-04-01');
  insertExpense(target, 1, 'phone', 1, 1000);
  insertExpense(target, 2, 'domain', 5, 700);
  insertRenewal(target, 'renew-phone', 'phone', 1, 1);
  return target;
}

describe('merging Yumi domains back into NoMoney', () => {
  test('replaces the stale domains with Yumi\'s and remaps their ledger rows', async () => {
    await createYumiSource();
    const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
    const target = await createNoMoneyTarget();

    const result = await mergeYumiDomains(target, sourcePath);

    expect(result).toEqual({ merged: true, counts: { domains: 2, expenses: 2, renewalEvents: 1, reminderLogs: 1 } });
    expect(target.all('SELECT id, domain_name, expire_date, archived_at FROM domains ORDER BY id')).toEqual([
      { id: 4, domain_name: 'live.example', expire_date: '2027-03-01', archived_at: null },
      { id: 9, domain_name: 'archived.example', expire_date: '2026-09-01', archived_at: stamp }
    ]);
    const expenses = target.all<{ id: number; asset_type: string; asset_id: number; amount_minor_units: number }>(
      'SELECT id, asset_type, asset_id, amount_minor_units FROM expenses ORDER BY id'
    );
    expect(expenses.map(({ asset_type, asset_id, amount_minor_units }) => ({ asset_type, asset_id, amount_minor_units }))).toEqual([
      { asset_type: 'phone', asset_id: 1, amount_minor_units: 1000 },
      { asset_type: 'domain', asset_id: 4, amount_minor_units: 1200 },
      { asset_type: 'domain', asset_id: 9, amount_minor_units: 900 }
    ]);
    // The phone expense keeps id 1; the domain renewal now points at its re-numbered expense.
    expect(expenses[0].id).toBe(1);
    const renewal = target.get<{ expense_id: number }>("SELECT expense_id FROM renewal_events WHERE request_id = 'renew-live'");
    expect(target.get('SELECT asset_type, asset_id, amount_minor_units FROM expenses WHERE id = ?', [renewal!.expense_id]))
      .toEqual({ asset_type: 'domain', asset_id: 4, amount_minor_units: 1200 });
    expect(target.get("SELECT expense_id FROM renewal_events WHERE request_id = 'renew-phone'")).toEqual({ expense_id: 1 });
    expect(target.all("SELECT request_id FROM renewal_events WHERE asset_type = 'vps'")).toEqual([]);
    expect(target.all("SELECT asset_id, kind FROM reminder_logs")).toEqual([{ asset_id: 4, kind: 'renewal' }]);

    // The Yumi file is left exactly as it was.
    expect(crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')).toBe(sourceHash);
  });

  test('runs once, and the merged state survives a restart', async () => {
    await createYumiSource();
    const target = await createNoMoneyTarget();
    await mergeYumiDomains(target, sourcePath);
    insertDomain(target, 10, 'added-after-merge.example', '2028-01-01');

    const reopened = await createDatabase({ filePath: path.join(directory, 'nomoney', 'app.db'), persist: true });
    expect(await mergeYumiDomains(reopened, sourcePath)).toEqual({ merged: false, reason: 'already-merged' });
    expect(reopened.all('SELECT id FROM domains ORDER BY id')).toEqual([{ id: 4 }, { id: 9 }, { id: 10 }]);
  });

  test('leaves NoMoney alone when there is no Yumi database', async () => {
    const target = await createNoMoneyTarget();

    expect(await mergeYumiDomains(target, sourcePath)).toEqual({ merged: false, reason: 'no-source' });
    expect(target.all('SELECT id FROM domains ORDER BY id')).toEqual([{ id: 4 }, { id: 5 }]);
    expect(target.get("SELECT value FROM settings WHERE key = 'yumiMergeVersion'")).toBeUndefined();
  });

  test('ignores a database that did not belong to Yumi', async () => {
    const other = await createDatabase({ filePath: sourcePath, persist: true });
    insertDomain(other, 1, 'not-yumi.example', '2027-01-01');
    const target = await createNoMoneyTarget();

    expect(await mergeYumiDomains(target, sourcePath)).toEqual({ merged: false, reason: 'source-not-yumi' });
    expect(target.all('SELECT id FROM domains ORDER BY id')).toEqual([{ id: 4 }, { id: 5 }]);
  });

  test('rolls back completely when a row cannot be imported', async () => {
    const yumi = await createYumiSource();
    insertRenewal(yumi, 'renew-phone', 'domain', 4, null);
    const target = await createNoMoneyTarget();
    const before = {
      domains: target.all('SELECT * FROM domains ORDER BY id'),
      expenses: target.all('SELECT * FROM expenses ORDER BY id'),
      renewals: target.all('SELECT * FROM renewal_events ORDER BY id')
    };

    await expect(mergeYumiDomains(target, sourcePath)).rejects.toThrow();

    expect(target.all('SELECT * FROM domains ORDER BY id')).toEqual(before.domains);
    expect(target.all('SELECT * FROM expenses ORDER BY id')).toEqual(before.expenses);
    expect(target.all('SELECT * FROM renewal_events ORDER BY id')).toEqual(before.renewals);
    expect(target.get("SELECT value FROM settings WHERE key = 'yumiMergeVersion'")).toBeUndefined();
  });
});

describe('retiring VPS data', () => {
  test('opening an older database removes VPS rows, their ledger and Status tables', async () => {
    const filePath = path.join(directory, 'legacy', 'app.db');
    const legacy = await createDatabase({ filePath, persist: true });
    legacy.exec(`
      CREATE TABLE vps (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE vps_status_samples (id INTEGER PRIMARY KEY, vps_id INTEGER NOT NULL);
      CREATE TABLE pending_status_alerts (id INTEGER PRIMARY KEY, vps_id INTEGER NOT NULL);
    `);
    legacy.run("INSERT INTO vps (id, name) VALUES (1, 'tokyo')");
    legacy.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('statusRetentionDays', '365')");
    insertExpense(legacy, 1, 'vps', 1, 500);
    insertExpense(legacy, 2, 'domain', 3, 1200);
    insertRenewal(legacy, 'renew-vps', 'vps', 1, 1);

    const reopened = await createDatabase({ filePath, persist: true });

    const tables = reopened.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name);
    expect(tables).not.toContain('vps');
    expect(tables).not.toContain('vps_status_samples');
    expect(tables).not.toContain('pending_status_alerts');
    expect(reopened.all('SELECT id, asset_type FROM expenses')).toEqual([{ id: 2, asset_type: 'domain' }]);
    expect(reopened.all('SELECT * FROM renewal_events')).toEqual([]);
    expect(reopened.get("SELECT value FROM settings WHERE key = 'statusRetentionDays'")).toBeUndefined();
  });
});
