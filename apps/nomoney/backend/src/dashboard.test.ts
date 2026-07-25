import { describe, expect, setupAgent, test } from './test-utils.js';

describe('dashboard APIs', () => {
  test('summarizes predicted and actual costs by currency', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/vps').send({
      name: 'Tokyo VPS',
      provider: 'Vultr',
      amountMinorUnits: 600,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-05-29',
      status: 'active'
    });

    await agent.post('/api/domains').send({
      domainName: 'moneypulse.dev',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2026-06-02',
      status: 'active'
    });

    await agent.post('/api/subscriptions').send({
      name: 'iCloud',
      provider: 'Apple',
      amountMinorUnits: 210,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-05',
      status: 'active'
    });

    await agent.post('/api/expenses').send({
      assetType: 'vps',
      assetId: 1,
      amountMinorUnits: 600,
      currency: 'USD',
      paidAt: '2026-05-10',
      category: 'monthly'
    });

    const summary = await agent.get('/api/dashboard/summary?year=2026');
    expect(summary.status).toBe(200);
    expect(summary.body.predictedMonthly).toEqual({
      CNY: 210,
      USD: 700
    });
    expect(summary.body.predictedYearly).toEqual({
      CNY: 2520,
      USD: 8400
    });
    expect(summary.body.actualYearly).toEqual({
      USD: 600
    });
    expect(summary.body.assetCounts).toMatchObject({
      vps: 1,
      domains: 1,
      subscriptions: 1
    });
  });

  test('does not forecast one-time buyout purchases as recurring costs', async () => {
    const { agent, context } = await setupAgent();

    await agent.post('/api/subscriptions').send({
      name: 'Lifetime Tool',
      purchaseType: 'buyout',
      amountMinorUnits: 4900,
      currency: 'CAD',
      billingCycle: 'annual',
      status: 'active'
    });

    context.db.run("UPDATE subscriptions SET next_due_date = '2026-05-25', auto_renew = 1 WHERE id = 1");

    const summary = await agent.get('/api/dashboard/summary?year=2026');
    const expiring = await agent.get('/api/dashboard/expiring?days=7');
    expect(summary.body.predictedMonthly.CAD).toBeUndefined();
    expect(summary.body.predictedYearly.CAD).toBeUndefined();
    expect(summary.body.assetCounts.subscriptions).toBe(1);
    expect(summary.body.expiringCount).toBe(0);
    expect(expiring.body.items).toEqual([]);
  });

  test('returns cost breakdowns for every asset category', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/phones').send({
      phoneType: 'domestic',
      cardNumber: '+8613800000000',
      amountMinorUnits: 1900,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-05-25',
      status: 'active'
    });

    await agent.post('/api/vps').send({
      name: 'Route VPS',
      vpsType: 'route',
      amountMinorUnits: 3000,
      currency: 'USD',
      billingCycle: 'quarterly',
      nextDueDate: '2026-06-01',
      status: 'active'
    });

    await agent.post('/api/domains').send({
      domainName: 'example.dev',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2026-06-02',
      status: 'active'
    });

    await agent.post('/api/subscriptions').send({
      name: 'Cloud Storage',
      purchaseType: 'subscription',
      amountMinorUnits: 210,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-05-27',
      status: 'active'
    });

    await agent.post('/api/subscriptions').send({
      name: 'Lifetime Tool',
      purchaseType: 'buyout',
      amountMinorUnits: 4900,
      currency: 'CAD',
      billingCycle: 'annual',
      status: 'active'
    });

    await agent.post('/api/expenses').send({
      assetType: 'phone',
      assetId: 1,
      amountMinorUnits: 1900,
      currency: 'CNY',
      paidAt: '2026-05-10',
      category: 'monthly'
    });

    await agent.post('/api/expenses').send({
      assetType: 'domain',
      assetId: 1,
      amountMinorUnits: 1200,
      currency: 'USD',
      paidAt: '2026-05-11',
      category: 'renewal'
    });

    const summary = await agent.get('/api/dashboard/summary?year=2026');

    expect(summary.status).toBe(200);
    expect(Object.keys(summary.body.categoryCosts)).toEqual(['phone', 'vps', 'domain', 'subscription']);
    expect(summary.body.categoryCosts.phone).toMatchObject({
      assetType: 'phone',
      assetCount: 1,
      recurringCount: 1,
      predictedMonthly: { CNY: 1900 },
      predictedYearly: { CNY: 22800 },
      actualYearly: { CNY: 1900 },
      oneTimeCost: {},
      dueCount: 1
    });
    expect(summary.body.categoryCosts.vps).toMatchObject({
      assetCount: 1,
      predictedMonthly: { USD: 1000 },
      predictedYearly: { USD: 12000 },
      actualYearly: {},
      dueCount: 1
    });
    expect(summary.body.categoryCosts.domain).toMatchObject({
      assetCount: 1,
      predictedMonthly: { USD: 100 },
      predictedYearly: { USD: 1200 },
      actualYearly: { USD: 1200 },
      dueCount: 1
    });
    expect(summary.body.categoryCosts.subscription).toMatchObject({
      assetCount: 2,
      recurringCount: 1,
      predictedMonthly: { CNY: 210 },
      predictedYearly: { CNY: 2520 },
      oneTimeCost: { CAD: 4900 },
      dueCount: 1
    });
    expect(summary.body.categoryCosts.subscription.subcategories).toEqual([
      expect.objectContaining({ key: 'subscription', count: 1, predictedMonthly: { CNY: 210 } }),
      expect.objectContaining({ key: 'buyout', count: 1, oneTimeCost: { CAD: 4900 } })
    ]);
  });

  test('returns due items across all asset types', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/phones').send({
      cardNumber: '+8613800000000',
      carrier: 'China Mobile',
      planName: 'Basic',
      amountMinorUnits: 1900,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-05-25',
      status: 'active'
    });

    const response = await agent.get('/api/dashboard/expiring?days=7');
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({
        assetType: 'phone',
        name: '+8613800000000',
        dueDate: '2026-05-25',
        daysLeft: 3
      })
    ]);
  });

  test('summarizes due risk buckets and next due liabilities', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/domains').send({
      domainName: 'urgent.dev',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2026-05-22',
      status: 'active'
    });

    await agent.post('/api/subscriptions').send({
      name: 'Soon SaaS',
      provider: 'Vendor',
      amountMinorUnits: 3000,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-05-27',
      status: 'active'
    });

    await agent.post('/api/vps').send({
      name: 'Later VPS',
      provider: 'Vultr',
      amountMinorUnits: 700,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-10',
      status: 'active'
    });

    const summary = await agent.get('/api/dashboard/summary?year=2026');

    expect(summary.status).toBe(200);
    expect(summary.body.dueBuckets).toEqual({
      overdue: 0,
      today: 1,
      week: 1,
      month: 1
    });
    expect(summary.body.nextDueItems).toEqual([
      expect.objectContaining({ name: 'urgent.dev', daysLeft: 0 }),
      expect.objectContaining({ name: 'Soon SaaS', daysLeft: 5 }),
      expect.objectContaining({ name: 'Later VPS', daysLeft: 19 })
    ]);
  });

  test('summarizes phone card totals by region type and carrier', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/phones').send({
      phoneType: 'domestic',
      cardNumber: '+8613800000000',
      carrier: 'China Mobile',
      monthlyRentMinorUnits: 3900,
      discountMinorUnits: 1500,
      amountMinorUnits: 2400,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-01',
      status: 'active'
    });

    await agent.post('/api/phones').send({
      phoneType: 'domestic',
      cardNumber: '+8613900000000',
      carrier: 'China Mobile',
      monthlyRentMinorUnits: 2900,
      amountMinorUnits: 2900,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-08',
      status: 'active'
    });

    await agent.post('/api/phones').send({
      phoneType: 'foreign',
      cardNumber: '+12025550188',
      carrier: 'T-Mobile',
      amountMinorUnits: 500,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-15',
      status: 'active'
    });

    const summary = await agent.get('/api/dashboard/summary?year=2026');

    expect(summary.status).toBe(200);
    expect(summary.body.phoneStats).toEqual({
      total: 3,
      domestic: 2,
      foreign: 1,
      monthlyRentByCurrency: {
        CNY: 5300,
        USD: 500
      },
      carriers: [
        { carrier: 'China Mobile', count: 2 },
        { carrier: 'T-Mobile', count: 1 }
      ]
    });
  });
});
