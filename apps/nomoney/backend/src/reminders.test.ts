import { describe, expect, setupAgent, test } from './test-utils.js';

describe('reminders', () => {
  test('sends one digest email for due assets and does not resend the same reminder', async () => {
    const { agent, context } = await setupAgent();

    await agent.put('/api/settings').send({
      reminderDays: [7, 3, 1, 0],
      reminderEnabled: true,
      smtpTo: 'owner@example.com',
      smtpFrom: 'moneypulse@example.com'
    });

    await agent.post('/api/domains').send({
      domainName: 'example.com',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2026-05-25',
      status: 'active',
      renewalUrl: 'https://dash.cloudflare.com'
    });

    const firstRun = await agent.post('/api/reminders/run-now');
    expect(firstRun.status).toBe(200);
    expect(firstRun.body.sent).toBe(true);
    expect(firstRun.body.items).toHaveLength(1);
    expect(context.mailer.sent).toHaveLength(1);
    expect(context.mailer.sent[0].subject).toContain('资产到期提醒');

    const secondRun = await agent.post('/api/reminders/run-now');
    expect(secondRun.status).toBe(200);
    expect(secondRun.body.sent).toBe(false);
    expect(context.mailer.sent).toHaveLength(1);

    const logs = await agent.get('/api/reminders/logs');
    expect(logs.body.items[0]).toMatchObject({
      assetType: 'domain',
      assetId: 1,
      daysBefore: 3,
      status: 'sent'
    });
  });

  test('paginates reminder logs with metadata', async () => {
    const { agent, context } = await setupAgent();

    await agent.put('/api/settings').send({
      reminderDays: [3],
      reminderEnabled: true,
      smtpTo: 'owner@example.com',
      smtpFrom: 'moneypulse@example.com'
    });

    for (const name of ['a.dev', 'b.dev', 'c.dev']) {
      await agent.post('/api/domains').send({
        domainName: name,
        registrar: 'Cloudflare',
        amountMinorUnits: 1200,
        currency: 'USD',
        billingCycle: 'annual',
        expireDate: '2026-05-25',
        status: 'active'
      });
    }

    await agent.post('/api/reminders/run-now');
    expect(context.mailer.sent).toHaveLength(1);

    const logs = await agent.get('/api/reminders/logs?limit=2&offset=1');

    expect(logs.status).toBe(200);
    expect(logs.body.meta).toEqual({ total: 3, limit: 2, offset: 1 });
    expect(logs.body.items).toHaveLength(2);
  });

  test('does not send renewal reminders for buyout purchases', async () => {
    const { agent, context } = await setupAgent();

    await agent.put('/api/settings').send({
      reminderDays: [3],
      reminderEnabled: true,
      smtpTo: 'owner@example.com',
      smtpFrom: 'moneypulse@example.com'
    });
    await agent.post('/api/subscriptions').send({
      name: 'Lifetime Tool',
      purchaseType: 'buyout',
      amountMinorUnits: 4900,
      currency: 'CAD',
      billingCycle: 'annual',
      status: 'active'
    });
    context.db.run("UPDATE subscriptions SET next_due_date = '2026-05-25', auto_renew = 1 WHERE id = 1");

    const response = await agent.post('/api/reminders/run-now');

    expect(response.status).toBe(200);
    expect(response.body.sent).toBe(false);
    expect(response.body.items).toEqual([]);
    expect(context.mailer.sent).toEqual([]);
  });

  test('caps Yumi domain and VPS reminder lead time at three days', async () => {
    const { agent, context } = await setupAgent('yumi');

    await agent.put('/api/settings').send({
      reminderDays: [30, 14, 7, 4, 3, 1, 0],
      reminderEnabled: true,
      smtpTo: 'owner@example.com',
      smtpFrom: 'yumi@example.com'
    });
    await agent.post('/api/domains').send({
      domainName: 'three-days.example', registrar: 'Cloudflare', amountMinorUnits: 1200,
      currency: 'USD', billingCycle: 'annual', expireDate: '2026-05-25', status: 'active'
    });
    await agent.post('/api/vps').send({
      name: 'four-days', provider: 'Example', amountMinorUnits: 1200,
      currency: 'USD', billingCycle: 'annual', expireDate: '2026-05-26', status: 'active'
    });

    const response = await agent.post('/api/reminders/run-now');

    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(['three-days.example']);
    expect((await agent.get('/api/settings')).body.settings.reminderDays).toEqual([3, 1, 0]);
    expect(context.mailer.sent).toHaveLength(1);
  });
});
