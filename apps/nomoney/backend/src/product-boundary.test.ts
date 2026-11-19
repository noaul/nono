import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { adminCookie, createTestContext } from './test-utils.js';

async function productAgent() {
  const context = await createTestContext();
  context.now = () => new Date('2026-08-11T12:00:00.000Z');
  context.fetch = async () => new Response('{}', { status: 200 });
  const agent = request.agent(createApp(context));
  return {
    agent,
    context,
    get: (url: string) => agent.get(url).set('Cookie', adminCookie),
    post: (url: string) => agent.post(url).set('Cookie', adminCookie)
  };
}

describe('product API boundaries', () => {
  test('NoMoney manages phone cards, domains, subscriptions and accounts', async () => {
    const { get } = await productAgent();

    expect(await get('/api/phones')).toMatchObject({ status: 200 });
    expect(await get('/api/domains')).toMatchObject({ status: 200 });
    expect(await get('/api/subscriptions')).toMatchObject({ status: 200 });
    expect(await get('/api/accounts')).toMatchObject({ status: 200 });
    expect(await get('/api/dashboard/summary?year=2026')).toMatchObject({ status: 200 });
  });

  test('VPS management and Status monitoring are retired', async () => {
    const { get, post } = await productAgent();

    expect(await get('/api/vps')).toMatchObject({ status: 404 });
    expect(await get('/api/vps/export.csv')).toMatchObject({ status: 404 });
    expect(await get('/api/status/overview')).toMatchObject({ status: 404 });
    expect(await post('/api/internal/vps/1/renew').set('x-nono-internal-token', 'test-internal-token').send({})).toMatchObject({ status: 404 });
    const dashboard = await get('/api/dashboard/summary?year=2026');
    expect(dashboard.body.categoryCosts).not.toHaveProperty('vps');
    expect(dashboard.body.assetCounts).not.toHaveProperty('vps');
  });

  test('domain registry and certificate checks run in NoMoney', async () => {
    const { context, post } = await productAgent();
    context.certificateProbe = async () => ({ validTo: '2027-02-01T00:00:00.000Z', issuer: 'Test CA' });
    const created = await post('/api/domains').send({
      domainName: 'example.com', amountMinorUnits: 1000, currency: 'USD', billingCycle: 'annual', expireDate: '2027-01-01', status: 'active'
    });
    expect(created.status).toBe(201);
    const checked = await post(`/api/domains/${created.body.item.id}/check`);
    expect(checked.status, JSON.stringify(checked.body)).toBe(200);
  });
});
