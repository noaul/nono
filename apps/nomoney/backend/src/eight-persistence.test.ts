import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { createTestContext, setupAgent } from './test-utils.js';
import { createDatabase } from './db.js';
import { buildBackupPayload, restoreBackupPayload } from './backup.js';
import { renewAsset, undoRenewal } from './renewals.js';
import { runReminderScan } from './reminders.js';
import { runStatusSweep } from './status.js';

const domain = { domainName: 'example.com', amountMinorUnits: 1200, currency: 'USD', billingCycle: 'annual', expireDate: '2026-05-25', status: 'active' };

function seedVps(context: Awaited<ReturnType<typeof createTestContext>>) {
  context.db.run("INSERT INTO vps (id, name, probe_url, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (1, 'node', 'https://probe.example.com/stats', 0, 'USD', 'monthly', 'active', '[]', '2026-05-01', '2026-05-01')");
  context.db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('smtpTo', '"ops@example.com"')`);
  context.fetch = async () => new Response('down', { status: 502 });
}

test('Yumi backup round trips every VPS/domain field and domain undo restores the last renewal date', async () => {
  const { agent, context } = await setupAgent('yumi');
  await agent.post('/api/domains').send({ ...domain, lastRenewDate: '2025-05-25' }).expect(201);
  seedVps(context);
  context.db.run("UPDATE vps SET panel_url = 'https://panel.example', ipv6_address = '2001:db8::1', traffic_quota_gb = 100, traffic_reset_day = 15, traffic_used_bytes = 300, traffic_last_total_bytes = 400, traffic_period_start = '2026-05-15', alert_traffic_period = '2026-05-15', alert_disk_at = '2026-05-22T00:00:00Z', alert_down_since = '2026-05-21T00:00:00Z'");
  context.db.run("UPDATE domains SET rdap_expire_date = '2026-05-25', rdap_checked_at = '2026-05-22', rdap_error = 'lookup failed', ssl_expires_at = '2026-06-01', ssl_issuer = 'Issuer', ssl_checked_at = '2026-05-22', ssl_error = 'check failed'");
  const renewed = renewAsset(context, 'domain', 1, { requestId: 'backup-domain-renew', expectedDueDate: '2026-05-25' });
  const original = buildBackupPayload(context);
  const restored = await createTestContext('yumi');
  restoreBackupPayload(restored, JSON.parse(JSON.stringify(original)));
  const roundTrip = buildBackupPayload(restored);
  for (const key of ['vps', 'domains', 'renewalEvents']) expect(roundTrip[key]).toEqual(original[key]);
  undoRenewal(restored, 'domain', 1, renewed.renewal.id);
  expect(restored.db.get('SELECT expire_date, last_renew_date FROM domains')).toEqual({ expire_date: '2026-05-25', last_renew_date: '2025-05-25' });
});

test('reminders independently deliver different kinds on the same date and retry only failed kinds', async () => {
  const { agent, context } = await setupAgent('yumi');
  await agent.put('/api/settings').send({ smtpTo: 'ops@example.com', reminderDays: [3] }).expect(200);
  await agent.post('/api/domains').send(domain).expect(201);
  expect((await runReminderScan(context, ['domain'])).items.map((item) => item.kind)).toEqual(['renewal']);
  context.db.run("UPDATE domains SET ssl_expires_at = '2026-05-25'");
  const send = context.mailer.send.bind(context.mailer);
  context.mailer.send = async () => { throw new Error('offline'); };
  const failed = await runReminderScan(context, ['domain']);
  expect(failed.items.map((item) => item.kind)).toEqual(['certificate']);
  expect(failed.sent).toBe(false);
  context.mailer.send = send;
  expect((await runReminderScan(context, ['domain'])).sent).toBe(true);
  expect((await runReminderScan(context, ['domain'])).items).toEqual([]);
  expect(context.db.all("SELECT kind, status FROM reminder_logs ORDER BY id")).toEqual([
    { kind: 'renewal', status: 'sent' }, { kind: 'certificate', status: 'failed' }, { kind: 'certificate', status: 'sent' }
  ]);
  const restored = await createTestContext('yumi');
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

test('failed status alerts survive sweeps and restart, keep true outage duration, and stop after delivery', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-alert-'));
  try {
    const filePath = path.join(directory, 'status.sqlite');
    let context = await createTestContext('yumi');
    context.db = await createDatabase({ filePath, persist: true, product: 'yumi' });
    seedVps(context);
    context.mailer.send = async () => { throw new Error('offline'); };
    await runStatusSweep(context);
    expect((await runStatusSweep(context)).alerts).toEqual([expect.objectContaining({ kind: 'down', delivered: false })]);
    context.now = () => new Date('2026-05-22T01:05:00Z');
    expect((await runStatusSweep(context)).alerts).toEqual([expect.objectContaining({ kind: 'down', delivered: false })]);
    expect(context.db.get('SELECT alert_down_since FROM vps')).toEqual({ alert_down_since: '2026-05-22T01:00:00.000Z' });
    context = { ...context, db: await createDatabase({ filePath, persist: true, product: 'yumi' }) };
    context.now = () => new Date('2026-05-22T01:12:00Z');
    context.fetch = async () => new Response(JSON.stringify({ disk: { percent: 95 } }));
    const recovery = await runStatusSweep(context);
    expect(recovery.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'recovered', detail: '12', delivered: false })]));
    const backup = buildBackupPayload(context);
    const restored = await createTestContext('yumi');
    restoreBackupPayload(restored, backup);
    expect(restored.db.all('SELECT * FROM pending_status_alerts')).toEqual(context.db.all('SELECT * FROM pending_status_alerts'));
    context.now = () => new Date('2026-05-22T01:30:00Z');
    context.mailer.send = async (message) => { context.mailer.sent.push(message); };
    const sent = await runStatusSweep(context);
    expect(sent.alerts.map((alert) => alert.kind).sort()).toEqual(['disk', 'down', 'recovered']);
    expect(sent.alerts.every((alert) => alert.delivered)).toBe(true);
    expect(sent.alerts.find((alert) => alert.kind === 'recovered')?.detail).toBe('12');
    expect((await runStatusSweep(context)).alerts).toEqual([]);
    expect(context.mailer.sent).toHaveLength(1);
    const legacy = { ...backup }; delete legacy.pendingStatusAlerts;
    restoreBackupPayload(restored, legacy);
    expect(restored.db.all('SELECT * FROM pending_status_alerts')).toEqual([]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('failed disk and traffic alerts retry after usage normalizes and concurrent sweeps share one delivery', async () => {
  const context = await createTestContext('yumi'); seedVps(context);
  context.db.run("UPDATE vps SET traffic_quota_gb = 1, traffic_used_bytes = 1000000000, traffic_period_start = '2026-05-01'");
  context.fetch = async () => new Response(JSON.stringify({ disk: { percent: 95 } }));
  context.mailer.send = async () => { throw new Error('offline'); };
  expect((await runStatusSweep(context)).alerts.map((alert) => alert.kind).sort()).toEqual(['disk', 'traffic']);
  context.fetch = async () => new Response(JSON.stringify({ disk: { percent: 20 } }));
  context.db.run('UPDATE vps SET traffic_used_bytes = 0');
  context.mailer.send = async (message) => { context.mailer.sent.push(message); await new Promise((resolve) => setTimeout(resolve, 5)); };
  const results = await Promise.all([runStatusSweep(context), runStatusSweep(context)]);
  expect(results[0].alerts.map((alert) => alert.kind).sort()).toEqual(['disk', 'traffic']);
  expect(context.mailer.sent).toHaveLength(1);
  expect((await runStatusSweep(context)).alerts).toEqual([]);
});

test.each(['deleted', 'archived', 'cancelled'])('pending alerts for a %s VPS are discarded', async (state) => {
  const context = await createTestContext('yumi'); seedVps(context);
  context.mailer.send = async () => { throw new Error('offline'); };
  await runStatusSweep(context); await runStatusSweep(context);
  if (state === 'deleted') context.db.run('DELETE FROM vps');
  else if (state === 'archived') context.db.run("UPDATE vps SET archived_at = '2026-05-22'");
  else context.db.run("UPDATE vps SET status = 'cancelled'");
  context.mailer.send = async (message) => { context.mailer.sent.push(message); };
  expect((await runStatusSweep(context)).alerts).toEqual([]);
  expect(context.db.all('SELECT * FROM pending_status_alerts')).toEqual([]);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test.each(['different', 'identical'])('an old delivery cannot acknowledge %s restored alerts with reused IDs', async (content) => {
  const context = await createTestContext('yumi'); seedVps(context);
  context.mailer.send = async () => { throw new Error('offline'); };
  await runStatusSweep(context); await runStatusSweep(context);
  const restored = buildBackupPayload(context);
  const pending = restored.pendingStatusAlerts as Array<Record<string, unknown>>;
  if (content === 'different') {
    pending[0].kind = 'recovered';
    pending[0].detail = '12';
  }
  const deliveryStarted = deferred<void>();
  const deliveryFinished = deferred<void>();
  context.mailer.send = async () => {
    deliveryStarted.resolve();
    await deliveryFinished.promise;
  };
  const oldSweep = runStatusSweep(context);
  await deliveryStarted.promise;
  restoreBackupPayload(context, restored);
  deliveryFinished.resolve();
  await oldSweep;
  expect(context.db.all('SELECT * FROM pending_status_alerts')).toEqual(pending);
  context.mailer.send = async (message) => { context.mailer.sent.push(message); };
  const retry = await runStatusSweep(context);
  expect(retry.alerts).toEqual([expect.objectContaining({ kind: pending[0].kind, detail: pending[0].detail, delivered: true })]);
  expect(context.mailer.sent).toHaveLength(1);
  expect(context.db.all('SELECT * FROM pending_status_alerts')).toEqual([]);
});

test('a probe started before restore cannot overwrite the restored node or produce stale alerts', async () => {
  const context = await createTestContext('yumi'); seedVps(context);
  context.db.run("UPDATE vps SET monitor_status = 'online', monitor_disk_percent = 20, monitor_updated_at = '2026-05-21T00:00:00Z'");
  const restored = buildBackupPayload(context);
  const probeStarted = deferred<void>();
  const probeFinished = deferred<Response>();
  context.fetch = async () => {
    probeStarted.resolve();
    return probeFinished.promise;
  };
  const oldSweep = runStatusSweep(context);
  await probeStarted.promise;
  restoreBackupPayload(context, restored);
  probeFinished.resolve(new Response(JSON.stringify({ disk: { percent: 99 } })));
  await oldSweep;
  expect(context.db.all('SELECT * FROM vps')).toEqual(restored.vps);
  expect(context.db.all('SELECT * FROM vps_status_samples')).toEqual(restored.vpsStatusSamples);
  expect(context.db.all('SELECT * FROM pending_status_alerts')).toEqual([]);
  expect(context.mailer.sent).toEqual([]);
  context.fetch = async () => new Response(JSON.stringify({ disk: { percent: 99 } }));
  expect((await runStatusSweep(context)).alerts).toEqual([expect.objectContaining({ kind: 'disk', delivered: true })]);
  expect(context.mailer.sent).toHaveLength(1);
});

test('a rolled-back restore leaves acknowledgement of the existing queue valid', async () => {
  const context = await createTestContext('yumi'); seedVps(context);
  context.mailer.send = async () => { throw new Error('offline'); };
  await runStatusSweep(context); await runStatusSweep(context);
  const invalid = buildBackupPayload(context);
  invalid.pendingStatusAlerts = [{ id: 1 }];
  const deliveryStarted = deferred<void>();
  const deliveryFinished = deferred<void>();
  context.mailer.send = async () => { deliveryStarted.resolve(); await deliveryFinished.promise; };
  const sweep = runStatusSweep(context);
  await deliveryStarted.promise;
  expect(() => restoreBackupPayload(context, invalid)).toThrow();
  deliveryFinished.resolve();
  await sweep;
  expect(context.db.all('SELECT * FROM pending_status_alerts')).toEqual([]);
});
