import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { createTestContext } from './test-utils.js';

describe('internal notification feed', () => {
  test('requires the internal token and returns only NoMoney due items', async () => {
    const context = await createTestContext('nomoney');
    context.db.run("INSERT INTO phones (id, card_number, amount_minor_units, currency, billing_cycle, status, next_due_date, created_at, updated_at) VALUES (1, '13800138000', 10, 'CNY', 'monthly', 'active', '2026-06-10', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO vps (id, name, amount_minor_units, currency, billing_cycle, status, expire_date, tags, created_at, updated_at) VALUES (2, 'hidden-vps', 20, 'USD', 'monthly', 'active', '2026-06-10', '[]', '2026-01-01', '2026-01-01')");
    const app = createApp(context);

    expect((await request(app).get('/api/internal/notifications/due')).status).toBe(401);

    const response = await request(app)
      .get('/api/internal/notifications/due')
      .set('x-nono-internal-token', 'test-internal-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{ assetType: 'phone', id: 1, name: '13800138000', dueDate: '2026-06-10', status: 'active' }],
    });
  });

  test('returns only Yumi due items in Yumi mode', async () => {
    const context = await createTestContext('yumi');
    context.db.run("INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, status, expire_date, tags, created_at, updated_at) VALUES (3, 'example.com', 30, 'USD', 'annual', 'active', '2026-06-15', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO subscriptions (id, name, amount_minor_units, currency, billing_cycle, status, next_due_date, tags, created_at, updated_at) VALUES (4, 'hidden-subscription', 40, 'USD', 'monthly', 'active', '2026-06-15', '[]', '2026-01-01', '2026-01-01')");
    const app = createApp(context);

    const response = await request(app)
      .get('/api/internal/notifications/due')
      .set('x-nono-internal-token', 'test-internal-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{ assetType: 'domain', id: 3, name: 'example.com', dueDate: '2026-06-15', status: 'active' }],
    });
  });

  test('summarises NoMoney due items and monthly spending for the NoDesk overview', async () => {
    const context = await createTestContext('nomoney');
    context.fetch = async () => { throw new Error('offline'); };
    context.db.run("INSERT INTO phones (id, card_number, amount_minor_units, currency, billing_cycle, status, next_due_date, created_at, updated_at) VALUES (1, '13800138000', 1000, 'CNY', 'monthly', 'active', '2026-05-20', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO subscriptions (id, name, amount_minor_units, currency, billing_cycle, status, next_due_date, tags, created_at, updated_at) VALUES (2, 'Music', 500, 'CNY', 'monthly', 'active', '2026-05-25', '[]', '2026-01-01', '2026-01-01')");
    const app = createApp(context);

    expect((await request(app).get('/api/internal/overview')).status).toBe(401);
    const response = await request(app).get('/api/internal/overview').set('x-nono-internal-token', 'test-internal-token');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      product: 'nomoney',
      due: { buckets: { overdue: 1, week: 1 }, next: [{ name: '13800138000', daysLeft: -2 }, { name: 'Music', daysLeft: 3 }] },
      assetCounts: { phones: 1, subscriptions: 1 },
      spending: { predictedMonthly: { currency: 'CNY', amountMinorUnits: 1500 }, predictedMonthlyByCurrency: { CNY: 1500 } }
    });
  });

  test('reports Yumi node health in the overview', async () => {
    const context = await createTestContext('yumi');
    context.db.run("INSERT INTO vps (id, name, amount_minor_units, currency, billing_cycle, status, probe_url, monitor_status, monitor_updated_at, tags, created_at, updated_at) VALUES (1, 'tokyo', 500, 'USD', 'monthly', 'active', 'http://probe', 'down', '2026-05-22T00:58:00.000Z', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO vps_status_samples (vps_id, sampled_at, state, latency_ms, detail) VALUES (1, '2026-05-22T00:58:00.000Z', 'down', NULL, 'timeout')");
    const response = await request(createApp(context)).get('/api/internal/overview').set('x-nono-internal-token', 'test-internal-token');
    expect(response.status).toBe(200);
    expect(response.body.product).toBe('yumi');
    expect(response.body.status).toMatchObject({ configured: 1 });
    expect(response.body.status).toMatchObject({ overall: 'major_outage', down: ['tokyo'], degraded: [] });
    expect(response.body).not.toHaveProperty('spending');
  });
});
