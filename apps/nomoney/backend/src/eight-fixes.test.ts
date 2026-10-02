import { createServer } from 'node:http';
import { describe, expect, test } from 'vitest';
import { createTestContext, setupAgent } from './test-utils.js';
import { requestOutbound } from './outbound-request.js';
import request from 'supertest';
import { createApp } from './app.js';
import { createNonoNotifier } from './notifier.js';
import { encryptSecret } from './secret-crypto.js';
import { getLegacyChannelSettings } from './settings.js';
import { renewAsset, runAutoRenewals, undoRenewal } from './renewals.js';
import { runReminderScan } from './reminders.js';

describe('outbound request regressions', () => {
  test.each([[204, 'POST'], [205, 'POST'], [304, 'GET'], [200, 'HEAD']])('real HTTP %s %s has a null body', async (status, method) => {
    const server = createServer((_req, res) => { res.writeHead(Number(status)); res.end(); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const context = await createTestContext();
      context.fetch = undefined;
      context.privateOutboundHosts = ['127.0.0.1'];
      const address = server.address() as { port: number };
      const response = await requestOutbound(context, `http://127.0.0.1:${address.port}`, { method: String(method) });
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});

describe('notification relay to NoNo', () => {
  test('a failed relay does not mark a digest sent, then retries successfully', async () => {
    const { agent, context } = await setupAgent();
    await agent.post('/api/subscriptions').send({ name: 'Long digest', amountMinorUnits: 1, currency: 'USD', billingCycle: 'monthly', nextDueDate: '2026-05-25', status: 'active' }).expect(201);
    const send = context.notifier.send.bind(context.notifier);
    context.notifier.send = async () => { throw new Error('No notification channel is configured'); };
    expect((await runReminderScan(context, ['subscription'])).sent).toBe(false);
    expect(context.db.all("SELECT * FROM reminder_logs WHERE status = 'sent'")).toHaveLength(0);
    expect(context.db.get<{ error_message: string }>("SELECT error_message FROM reminder_logs WHERE status = 'failed'")?.error_message).toContain('No notification channel');
    context.notifier.send = send;
    expect((await runReminderScan(context, ['subscription'])).sent).toBe(true);
    expect(context.notifier.sent[0]).toMatchObject({ severity: 'warning' });
  });

  test('createNonoNotifier posts to the internal relay and surfaces NoNo errors', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let status = 200;
    const notifier = createNonoNotifier({
      baseUrl: 'http://nono', internalToken: 'secret', product: 'yumi',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ message: 'all channels failed' }), { status });
      }) as unknown as typeof fetch
    });
    await notifier.send({ subject: 'S', text: 'T', severity: 'critical' });
    expect(calls[0].url).toBe('http://nono/api/internal/notifications/relay');
    expect(calls[0].init.headers).toMatchObject({ 'x-nono-internal-token': 'secret' });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ product: 'yumi', subject: 'S', text: 'T', severity: 'critical' });
    expect(notifier.sent).toHaveLength(1);
    status = 502;
    await expect(notifier.send({ subject: 'S', text: 'T', severity: 'info' })).rejects.toThrow('all channels failed');
  });
});

test('automatic renewal respects an explicit undo until a manual payment advances the date', async () => {
  const { agent, context } = await setupAgent();
  await agent.post('/api/subscriptions').send({ name: 'Service', amountMinorUnits: 100, currency: 'USD', billingCycle: 'monthly', nextDueDate: '2026-05-21', autoRenew: true, status: 'active' }).expect(201);
  expect(runAutoRenewals(context, ['subscription'])).toHaveLength(1);
  const event = context.db.get<{ id: number }>('SELECT id FROM renewal_events')!;
  undoRenewal(context, 'subscription', 1, event.id);
  expect(runAutoRenewals(context, ['subscription'])).toEqual([]);
  expect(runAutoRenewals(context, ['subscription'])).toEqual([]);
  expect(context.db.all('SELECT * FROM expenses')).toHaveLength(0);
  renewAsset(context, 'subscription', 1, { requestId: 'manual-payment', expectedDueDate: '2026-05-21' });
  context.now = () => new Date('2026-06-22T00:00:00Z');
  expect(runAutoRenewals(context, ['subscription'])).toHaveLength(1);
  expect(context.db.all('SELECT * FROM expenses')).toHaveLength(2);
});

test('exports the pre-NoNo channel settings once for import and no longer accepts them', async () => {
  const { agent, context } = await setupAgent();
  const legacy = (key: string, value: unknown) => context.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
  legacy('smtpTo', 'ops@example.com'); legacy('smtpHost', 'smtp.example.com'); legacy('smtpPort', 465);
  legacy('webhookUrl', 'https://hooks.example.com/x');
  legacy('telegramBotToken', encryptSecret('tg-token', context.encryptionKey)); legacy('telegramChatId', '42');
  legacy('barkUrl', encryptSecret('https://api.day.app/private-key', context.encryptionKey));

  expect(getLegacyChannelSettings(context)).toEqual({
    email: { host: 'smtp.example.com', port: 465, user: '', from: '', to: 'ops@example.com' },
    webhook: { url: 'https://hooks.example.com/x' },
    telegram: { botToken: 'tg-token', chatId: '42' },
    bark: { url: 'https://api.day.app/private-key' }
  });
  await request(createApp(context)).get('/api/internal/notifications/legacy-channels').expect(401);
  const exported = await request(createApp(context)).get('/api/internal/notifications/legacy-channels').set('x-nono-internal-token', 'test-internal-token').expect(200);
  expect(exported.body.channels.telegram.botToken).toBe('tg-token');

  const settings = (await agent.get('/api/settings')).body.settings;
  for (const key of ['smtpTo', 'webhookUrl', 'telegramBotToken', 'barkUrl', 'barkUrlSet']) expect(settings).not.toHaveProperty(key);
  await agent.put('/api/settings').send({ webhookUrl: 'https://evil.example/' }).expect(200);
  expect(getLegacyChannelSettings(context).webhook).toEqual({ url: 'https://hooks.example.com/x' });
  await agent.post('/api/settings/test-notify').send({}).expect(404);
});

test('overview due items carry the actual domain renewal anchor through the API', async () => {
  const { agent, context } = await setupAgent('yumi');
  await agent.post('/api/domains').send({ domainName: 'anchor.example', amountMinorUnits: 100, currency: 'USD', billingCycle: 'annual', expireDate: '2026-06-01', nextDueDate: '2026-05-25', status: 'active' }).expect(201);
  const { body } = await agent.get('/api/dashboard/expiring?days=30').expect(200);
  const item = body.items.find((item: { kind: string }) => item.kind === 'renewal');
  expect(item).toMatchObject({ dueDate: '2026-05-25', expireDate: '2026-06-01', nextDueDate: '2026-05-25' });
  await agent.post('/api/domains/1/renew').send({ requestId: 'overview-wrong-date', expectedDueDate: item.dueDate }).expect(409);
  const renewed = await agent.post('/api/domains/1/renew').send({ requestId: 'overview-right-date', expectedDueDate: item.expireDate }).expect(200);
  expect(renewed.body.item.expireDate).toBe('2027-06-01');
  expect(context.db.all('SELECT * FROM expenses')).toHaveLength(1);
});
