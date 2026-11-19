import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { createTestContext } from './test-utils.js';

describe('internal notification feed', () => {
  test('requires the internal token and returns due phone cards, domains and subscriptions', async () => {
    const context = await createTestContext();
    context.db.run("INSERT INTO phones (id, card_number, amount_minor_units, currency, billing_cycle, status, next_due_date, created_at, updated_at) VALUES (1, '13800138000', 10, 'CNY', 'monthly', 'active', '2026-06-10', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, status, expire_date, tags, created_at, updated_at) VALUES (3, 'example.com', 30, 'USD', 'annual', 'active', '2026-06-15', '[]', '2026-01-01', '2026-01-01')");
    const app = createApp(context);

    expect((await request(app).get('/api/internal/notifications/due')).status).toBe(401);

    const response = await request(app)
      .get('/api/internal/notifications/due')
      .set('x-nono-internal-token', 'test-internal-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        { assetType: 'phone', id: 1, name: '13800138000', dueDate: '2026-06-10', kind: 'renewal', status: 'active' },
        { assetType: 'domain', id: 3, name: 'example.com', dueDate: '2026-06-15', kind: 'renewal', status: 'active' }
      ],
    });
  });

  test('includes domains in the due feed', async () => {
    const context = await createTestContext();
    context.db.run("INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, status, expire_date, tags, created_at, updated_at) VALUES (3, 'example.com', 30, 'USD', 'annual', 'active', '2026-06-15', '[]', '2026-01-01', '2026-01-01')");
    const app = createApp(context);

    const response = await request(app)
      .get('/api/internal/notifications/due')
      .set('x-nono-internal-token', 'test-internal-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{ assetType: 'domain', id: 3, name: 'example.com', dueDate: '2026-06-15', kind: 'renewal', status: 'active' }],
    });
  });

  test('summarises NoMoney due items and monthly spending for the NoDesk overview', async () => {
    const context = await createTestContext();
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
      assetCounts: { phones: 1, subscriptions: 1, domains: 0 },
      spending: { predictedMonthly: { currency: 'CNY', amountMinorUnits: 1500 }, predictedMonthlyByCurrency: { CNY: 1500 } }
    });
    expect(response.body).not.toHaveProperty('status');
  });
});
