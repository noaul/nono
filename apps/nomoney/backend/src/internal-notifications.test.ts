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
});
