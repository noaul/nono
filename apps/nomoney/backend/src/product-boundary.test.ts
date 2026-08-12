import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import type { AppContext, ProductMode } from './types.js';

async function productAgent(product: ProductMode, cookiePath: string) {
  const db = await createDatabase({ persist: false, product });
  const context: AppContext = {
    db,
    product,
    jwtSecret: `${product}-test-secret`,
    internalToken: 'test-internal-token',
    encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    cookieSecure: false,
    cookiePath,
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    mailer: { sent: [], async send(message) { this.sent.push(message); } },
    fetch: async () => new Response('{}', { status: 200 }),
    privateOutboundHosts: []
  };
  const agent = request.agent(createApp(context));
  const setup = await agent.post('/api/auth/setup').send({
    username: 'owner',
    password: 'correct horse battery staple',
    email: 'owner@example.com'
  });
  const cookie = String(setup.headers['set-cookie'][0]).split(';', 1)[0];
  return {
    agent,
    context,
    setup,
    get: (url: string) => agent.get(url).set('Cookie', cookie),
    put: (url: string) => agent.put(url).set('Cookie', cookie),
    delete: (url: string) => agent.delete(url).set('Cookie', cookie)
  };
}

describe('product API and session boundaries', () => {
  test('NoMoney exposes financial assets but not VPS or domains', async () => {
    const { context, delete: remove, get, put, setup } = await productAgent('nomoney', '/nomoney');

    expect(setup.headers['set-cookie'][0]).toContain('Path=/nomoney');
    expect(await get('/api/phones')).toMatchObject({ status: 200 });
    expect(await get('/api/subscriptions')).toMatchObject({ status: 200 });
    expect(await get('/api/accounts')).toMatchObject({ status: 200 });
    expect(await get('/api/vps')).toMatchObject({ status: 404 });
    expect(await get('/api/domains')).toMatchObject({ status: 404 });
    expect(await get('/api/status/overview')).toMatchObject({ status: 404 });

    context.db.run("INSERT INTO vps (id, name, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (1, 'legacy-vps', 5000, 'USD', 'monthly', 'active', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO expenses (asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at) VALUES ('vps', 1, 5000, 'USD', '2026-05-01', 'monthly', '2026-05-01', '2026-05-01')");
    const dashboard = await get('/api/dashboard/summary?year=2026');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.categoryCosts).not.toHaveProperty('vps');
    expect(dashboard.body.actualYearly).not.toHaveProperty('USD');
    expect(await put('/api/expenses/1').send({ notes: 'cross-product update' })).toMatchObject({ status: 404 });
    expect(await remove('/api/expenses/1')).toMatchObject({ status: 404 });
    expect(context.db.get<{ notes: string | null }>('SELECT notes FROM expenses WHERE id = 1')?.notes).toBeNull();
  });

  test('Yumi exposes infrastructure assets but not NoMoney assets', async () => {
    const { get, setup } = await productAgent('yumi', '/yumi');

    expect(setup.headers['set-cookie'][0]).toContain('Path=/yumi');
    expect(await get('/api/vps')).toMatchObject({ status: 200 });
    expect(await get('/api/domains')).toMatchObject({ status: 200 });
    expect(await get('/api/expenses')).toMatchObject({ status: 200 });
    expect(await get('/api/status/overview')).toMatchObject({ status: 200 });
    expect(await get('/api/phones')).toMatchObject({ status: 404 });
    expect(await get('/api/subscriptions')).toMatchObject({ status: 404 });
    expect(await get('/api/accounts')).toMatchObject({ status: 404 });
    expect(await get('/api/dashboard/summary')).toMatchObject({ status: 404 });
  });
});
