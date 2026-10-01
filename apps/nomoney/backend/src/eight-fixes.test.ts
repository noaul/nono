import { createServer } from 'node:http';
import { describe, expect, test } from 'vitest';
import { createTestContext, setupAgent } from './test-utils.js';
import { requestOutbound } from './outbound-request.js';
import { configuredChannels, notify } from './notifier.js';
import { getSettings } from './settings.js';
import { renewAsset, runAutoRenewals, undoRenewal } from './renewals.js';
import { runReminderScan } from './reminders.js';

function setting(context: Awaited<ReturnType<typeof createTestContext>>, key: string, value: unknown) {
  context.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
}

describe('notification delivery regressions', () => {
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
      if (status === 204) {
        setting(context, 'webhookUrl', `http://127.0.0.1:${address.port}`);
        expect(await notify(context, { subject: 'Webhook', text: 'Delivered' })).toEqual([{ channel: 'webhook', ok: true }]);
      }
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  test.each(['telegram', 'bark'] as const)('%s sends every Unicode character in bounded complete parts', async (channel) => {
    const context = await createTestContext();
    setting(context, 'telegramBotToken', 'token'); setting(context, 'telegramChatId', '123');
    setting(context, 'barkUrl', 'https://api.day.app/key');
    const parts: string[] = [];
    context.fetch = async (_url, init) => {
      const payload = JSON.parse(String(init?.body)); parts.push(channel === 'telegram' ? payload.text : payload.body);
      return new Response('{}');
    };
    const message = { subject: 'Notice', text: 'a'.repeat(2999) + '😀中文'.repeat(3000) };
    expect(await notify(context, message, [channel])).toEqual([{ channel, ok: true }]);
    expect(parts.join('')).toBe(channel === 'telegram' ? `${message.subject}\n\n${message.text}` : message.text);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(channel === 'telegram' ? 4000 : 3000);
      expect(Buffer.from(part, 'utf8').toString('utf8')).toBe(part);
    }
  });

  test.each(['telegram', 'bark'] as const)('partial %s failure does not mark a digest sent, then retries successfully', async (channel) => {
    const { agent, context } = await setupAgent();
    await agent.put('/api/settings').send(channel === 'telegram' ? { telegramBotToken: 'token', telegramChatId: '123' } : { barkUrl: 'https://api.day.app/key' }).expect(200);
    await agent.post('/api/subscriptions').send({ name: 'Long digest', amountMinorUnits: 1, currency: 'USD', billingCycle: 'monthly', nextDueDate: '2026-05-25', status: 'active' }).expect(201);
    context.db.run('UPDATE subscriptions SET renewal_url = ?', ['https://example.com/' + 'a'.repeat(9000)]);
    let calls = 0;
    context.fetch = async () => new Response('{}', { status: ++calls === 2 ? 500 : 200 });
    expect((await runReminderScan(context, ['subscription'])).sent).toBe(false);
    expect(context.db.all("SELECT * FROM reminder_logs WHERE status = 'sent'")).toHaveLength(0);
    context.fetch = async () => new Response('{}');
    expect((await runReminderScan(context, ['subscription'])).sent).toBe(true);
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

test('Bark blank keeps the encrypted secret and explicit null removes the channel', async () => {
  const { agent, context } = await setupAgent();
  await agent.put('/api/settings').send({ barkUrl: 'https://api.day.app/private-key' }).expect(200);
  const kept = await agent.put('/api/settings').send({ barkUrl: '', language: 'en' }).expect(200);
  expect(kept.body.settings).toMatchObject({ barkUrl: '', barkUrlSet: true });
  expect(configuredChannels(getSettings(context))).toContain('bark');
  const cleared = await agent.put('/api/settings').send({ barkUrl: null }).expect(200);
  expect(cleared.body.settings).toMatchObject({ barkUrl: '', barkUrlSet: false });
  expect(configuredChannels(getSettings(context))).not.toContain('bark');
  expect(JSON.stringify(context.db.all('SELECT * FROM settings'))).not.toContain('private-key');
  expect((await agent.get('/api/settings')).body.settings.barkUrlSet).toBe(false);
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
