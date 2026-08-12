import { describe, expect, setupAgent, test } from './test-utils.js';

describe('expense APIs', () => {
  test('rejects expenses that reference a missing asset', async () => {
    const { agent } = await setupAgent();

    const response = await agent.post('/api/expenses').send({
      assetType: 'subscription',
      assetId: 999,
      amountMinorUnits: 2000,
      currency: 'USD',
      paidAt: '2026-05-10',
      category: 'monthly'
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ASSET_NOT_FOUND');
  });

  test('filters expenses and includes asset labels', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/subscriptions').send({
      name: 'ChatGPT',
      provider: 'OpenAI',
      account: 'owner@example.com',
      category: 'AI',
      amountMinorUnits: 2000,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-01',
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

    await agent.post('/api/expenses').send({
      assetType: 'subscription',
      assetId: 1,
      amountMinorUnits: 2000,
      currency: 'USD',
      paidAt: '2026-05-10',
      category: 'monthly'
    });

    await agent.post('/api/expenses').send({
      assetType: 'domain',
      assetId: 1,
      amountMinorUnits: 1200,
      currency: 'USD',
      paidAt: '2026-04-10',
      category: 'renewal'
    });

    const response = await agent.get('/api/expenses?year=2026&assetType=subscription&category=monthly&currency=USD');

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      total: 1,
      limit: 50,
      offset: 0,
      summary: {
        totalsByCurrency: { USD: 2000 },
        assetTypeCounts: { subscription: 1 },
        categoryCounts: { monthly: 1 },
        earliestPaidAt: '2026-05-10',
        latestPaidAt: '2026-05-10'
      }
    });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        assetType: 'subscription',
        assetId: 1,
        assetLabel: 'ChatGPT',
        category: 'monthly'
      })
    ]);
  });

  test('aggregates expense summary across the full filtered result, not only one page', async () => {
    const { agent } = await setupAgent('yumi');

    await agent.post('/api/vps').send({
      name: 'VPS A', amountMinorUnits: 1000, currency: 'USD', billingCycle: 'monthly', status: 'active'
    });
    await agent.post('/api/domains').send({
      domainName: 'example.ca', amountMinorUnits: 2000, currency: 'CAD', billingCycle: 'annual', status: 'active'
    });
    await agent.post('/api/expenses').send({ assetType: 'vps', assetId: 1, amountMinorUnits: 1000, currency: 'USD', paidAt: '2026-01-02', category: 'monthly' });
    await agent.post('/api/expenses').send({ assetType: 'domain', assetId: 1, amountMinorUnits: 2000, currency: 'CAD', paidAt: '2026-07-03', category: 'renewal' });

    const response = await agent.get('/api/expenses?year=2026&limit=1');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.meta.summary).toEqual({
      totalsByCurrency: { CAD: 2000, USD: 1000 },
      assetTypeCounts: { domain: 1, vps: 1 },
      categoryCounts: { monthly: 1, renewal: 1 },
      earliestPaidAt: '2026-01-02',
      latestPaidAt: '2026-07-03'
    });
  });

  test('returns lightweight asset lookup options for expense forms', async () => {
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

    const response = await agent.get('/api/assets/lookup');

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({
        assetType: 'vps',
        assetId: 1,
        label: 'Tokyo VPS',
        provider: 'Vultr'
      })
    ]);
  });
});
