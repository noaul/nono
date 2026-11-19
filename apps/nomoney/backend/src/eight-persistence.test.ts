import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { createTestContext, setupAgent } from './test-utils.js';
import { createDatabase } from './db.js';
import { buildBackupPayload, restoreBackupPayload } from './backup.js';
import { renewAsset, undoRenewal } from './renewals.js';
import { runReminderScan } from './reminders.js';

const domain = { domainName: 'example.com', amountMinorUnits: 1200, currency: 'USD', billingCycle: 'annual', expireDate: '2026-05-25', status: 'active' };

test('backup round trips every domain field and domain undo restores the last renewal date', async () => {
  const { agent, context } = await setupAgent();
  await agent.post('/api/domains').send({ ...domain, lastRenewDate: '2025-05-25' }).expect(201);
  context.db.run("UPDATE domains SET rdap_expire_date = '2026-05-25', rdap_checked_at = '2026-05-22', rdap_error = 'lookup failed', ssl_expires_at = '2026-06-01', ssl_issuer = 'Issuer', ssl_checked_at = '2026-05-22', ssl_error = 'check failed'");
  const renewed = renewAsset(context, 'domain', 1, { requestId: 'backup-domain-renew', expectedDueDate: '2026-05-25' });
  const original = buildBackupPayload(context);
  const restored = await createTestContext();
  restoreBackupPayload(restored, JSON.parse(JSON.stringify(original)));
  const roundTrip = buildBackupPayload(restored);
  for (const key of ['domains', 'renewalEvents']) expect(roundTrip[key]).toEqual(original[key]);
  undoRenewal(restored, 'domain', 1, renewed.renewal.id);
  expect(restored.db.get('SELECT expire_date, last_renew_date FROM domains')).toEqual({ expire_date: '2026-05-25', last_renew_date: '2025-05-25' });
});

test('reminders independently deliver different kinds on the same date and retry only failed kinds', async () => {
  const { agent, context } = await setupAgent();
  await agent.put('/api/settings').send({ smtpTo: 'ops@example.com', reminderDays: [3] }).expect(200);
  await agent.post('/api/domains').send(domain).expect(201);
  expect((await runReminderScan(context, ['domain'])).items.map((item) => item.kind)).toEqual(['renewal']);
  context.db.run("UPDATE domains SET ssl_expires_at = '2026-05-25'");
  const send = context.notifier.send.bind(context.notifier);
  context.notifier.send = async () => { throw new Error('offline'); };
  const failed = await runReminderScan(context, ['domain']);
  expect(failed.items.map((item) => item.kind)).toEqual(['certificate']);
  expect(failed.sent).toBe(false);
  context.notifier.send = send;
  expect((await runReminderScan(context, ['domain'])).sent).toBe(true);
  expect((await runReminderScan(context, ['domain'])).items).toEqual([]);
  expect(context.db.all("SELECT kind, status FROM reminder_logs ORDER BY id")).toEqual([
    { kind: 'renewal', status: 'sent' }, { kind: 'certificate', status: 'failed' }, { kind: 'certificate', status: 'sent' }
  ]);
  const restored = await createTestContext();
  restoreBackupPayload(restored, buildBackupPayload(context));
  expect(restored.db.all('SELECT * FROM reminder_logs')).toEqual(context.db.all('SELECT * FROM reminder_logs'));
  const legacy = buildBackupPayload(context);
  legacy.reminderLogs = [{ ...(legacy.reminderLogs as Record<string, unknown>[])[0] }];
  delete (legacy.reminderLogs as Record<string, unknown>[])[0].kind;
  restoreBackupPayload(restored, legacy);
  expect(restored.db.get('SELECT kind FROM reminder_logs')).toEqual({ kind: 'renewal' });
});

test('phone renewal and keepalive reminders on the same date both retain sent history', async () => {
  const { agent, context } = await setupAgent();
  await agent.put('/api/settings').send({ smtpTo: 'ops@example.com', reminderDays: [3] }).expect(200);
  await agent.post('/api/phones').send({ cardNumber: '123', amountMinorUnits: 100, currency: 'USD', billingCycle: 'monthly', nextDueDate: '2026-05-25', totalKeepaliveUntil: '2026-05-25', status: 'active' }).expect(201);
  expect((await runReminderScan(context, ['phone'])).items.map((item) => item.kind).sort()).toEqual(['keepalive', 'renewal']);
  expect(context.db.all('SELECT * FROM reminder_logs')).toHaveLength(2);
  expect((await runReminderScan(context, ['phone'])).items).toEqual([]);
});

test('opening a persisted legacy reminder database replaces its UNIQUE constraint without losing history', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-reminder-'));
  try {
    const filePath = path.join(directory, 'legacy.sqlite');
    const old = await createDatabase({ filePath, persist: true });
    old.exec('DROP TABLE reminder_logs');
    old.exec(`CREATE TABLE reminder_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, asset_type TEXT NOT NULL, asset_id INTEGER NOT NULL, due_date TEXT NOT NULL, days_before INTEGER NOT NULL, sent_at TEXT NOT NULL, status TEXT NOT NULL, error_message TEXT, UNIQUE(asset_type, asset_id, due_date, days_before, status))`);
    old.run("INSERT INTO reminder_logs VALUES (42, 'old', 'domain', 1, '2026-05-25', 3, '2026-05-22', 'sent', NULL)");
    const migrated = await createDatabase({ filePath, persist: true });
    expect(migrated.get('SELECT * FROM reminder_logs')).toMatchObject({ id: 42, kind: 'renewal', run_id: 'old' });
    migrated.run("INSERT INTO reminder_logs (run_id, asset_type, asset_id, due_date, days_before, sent_at, status, kind) VALUES ('new', 'domain', 1, '2026-05-25', 3, '2026-05-22', 'sent', 'certificate')");
    expect(migrated.all('SELECT * FROM reminder_logs')).toHaveLength(2);
    const reopened = await createDatabase({ filePath, persist: true });
    expect(reopened.all('SELECT * FROM reminder_logs')).toEqual(migrated.all('SELECT * FROM reminder_logs'));
    expect(() => reopened.run("INSERT INTO reminder_logs (run_id, asset_type, asset_id, due_date, days_before, sent_at, status, kind) VALUES ('duplicate', 'domain', 1, '2026-05-25', 3, '2026-05-22', 'sent', 'certificate')")).toThrow();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
