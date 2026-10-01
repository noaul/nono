import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { runAutoRenewals } from './renewals.js';
import { setupAgent } from './test-utils.js';

const activeVps = {
  name: 'nc48',
  amountMinorUnits: 1299,
  currency: 'CAD',
  billingCycle: 'annual',
  expireDate: '2027-08-10',
  status: 'active'
};

describe('VPS renewal APIs', () => {
  test('advances one billing cycle and records the renewal expense atomically', async () => {
    const { agent, context } = await setupAgent();
    await agent.post('/api/vps').send(activeVps).expect(201);

    const response = await agent.post('/api/vps/1/renew').send({
      requestId: 'renew-nc48-2027',
      expectedExpireDate: '2027-08-10'
    }).expect(200);

    expect(response.body).toMatchObject({
      idempotent: false,
      item: { id: 1, expireDate: '2028-08-10' },
      renewal: {
        previousExpireDate: '2027-08-10',
        renewedExpireDate: '2028-08-10',
        amountMinorUnits: 1299,
        currency: 'CAD'
      }
    });
    expect(context.db.all('SELECT * FROM expenses')).toEqual([
      expect.objectContaining({
        asset_type: 'vps',
        asset_id: 1,
        amount_minor_units: 1299,
        currency: 'CAD',
        paid_at: '2026-05-22',
        period_start: '2027-08-10',
        period_end: '2028-08-10',
        category: 'renewal'
      })
    ]);
  });

  test('returns the first result for a retried request without creating another expense', async () => {
    const { agent, context } = await setupAgent();
    await agent.post('/api/vps').send(activeVps).expect(201);
    const payload = { requestId: 'same-request', expectedExpireDate: '2027-08-10' };

    const first = await agent.post('/api/vps/1/renew').send(payload).expect(200);
    const retry = await agent.post('/api/vps/1/renew').send(payload).expect(200);

    expect(retry.body).toMatchObject({
      idempotent: true,
      renewal: { id: first.body.renewal.id, renewedExpireDate: '2028-08-10' },
      item: { expireDate: '2028-08-10' }
    });
    expect(context.db.all('SELECT id FROM expenses')).toHaveLength(1);
  });

  test('undo restores the previous date and removes its linked expense', async () => {
    const { agent, context } = await setupAgent();
    await agent.post('/api/vps').send(activeVps).expect(201);
    const renewed = await agent.post('/api/vps/1/renew').send({
      requestId: 'undo-request',
      expectedExpireDate: '2027-08-10'
    }).expect(200);

    const undone = await agent
      .post(`/api/vps/1/renewals/${renewed.body.renewal.id}/undo`)
      .expect(200);

    expect(undone.body.item).toMatchObject({ expireDate: '2027-08-10' });
    expect(context.db.all('SELECT id FROM expenses')).toHaveLength(0);
    expect(context.db.get<{ status: string }>('SELECT status FROM renewal_events WHERE id = ?', [renewed.body.renewal.id]))
      .toMatchObject({ status: 'undone' });
  });

  test('updates the expense amount attached to a renewal event', async () => {
    const { agent, context } = await setupAgent();
    await agent.post('/api/vps').send(activeVps).expect(201);
    const renewed = await agent.post('/api/vps/1/renew').send({
      requestId: 'amount-request',
      expectedExpireDate: '2027-08-10'
    }).expect(200);

    const updated = await agent
      .put(`/api/vps/1/renewals/${renewed.body.renewal.id}/expense`)
      .send({ amountMinorUnits: 1499 })
      .expect(200);

    expect(updated.body.renewal.amountMinorUnits).toBe(1499);
    expect(context.db.get<{ amount_minor_units: number }>('SELECT amount_minor_units FROM expenses'))
      .toMatchObject({ amount_minor_units: 1499 });
  });

  test('requires a usable expiry date, billing cycle, and active VPS', async () => {
    const { agent } = await setupAgent();
    await agent.post('/api/vps').send({ ...activeVps, name: 'Missing date', expireDate: null }).expect(201);
    await agent.post('/api/vps').send({ ...activeVps, name: 'Cancelled', status: 'cancelled' }).expect(201);

    const missing = await agent.post('/api/vps/1/renew').send({
      requestId: 'missing-date',
      expectedExpireDate: '2027-08-10'
    });
    const cancelled = await agent.post('/api/vps/2/renew').send({
      requestId: 'cancelled-vps',
      expectedExpireDate: '2027-08-10'
    });

    expect(missing.status).toBe(409);
    expect(missing.body.error.code).toBe('VPS_RENEWAL_CONFIGURATION_REQUIRED');
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.error.code).toBe('VPS_RENEWAL_NOT_ALLOWED');
  });

  test('protects the internal renewal endpoint with its service token', async () => {
    const { agent, app, context } = await setupAgent();
    context.internalToken = 'nono-to-nomoney-test-token';
    await agent.post('/api/vps').send(activeVps).expect(201);
    context.publicOrigin = 'https://nono.test';

    await request(app).post('/api/internal/vps/1/renew').send({
      requestId: 'internal-denied',
      expectedExpireDate: '2027-08-10'
    }).expect(401);

    const allowed = await request(app)
      .post('/api/internal/vps/1/renew')
      .set('x-nono-internal-token', 'nono-to-nomoney-test-token')
      .send({ requestId: 'internal-allowed', expectedExpireDate: '2027-08-10' })
      .expect(200);

    expect(allowed.body.item.expireDate).toBe('2028-08-10');

    const corrected = await request(app)
      .put(`/api/internal/vps/1/renewals/${allowed.body.renewal.id}/expense`)
      .set('x-nono-internal-token', 'nono-to-nomoney-test-token')
      .send({ amountMinorUnits: 1399 })
      .expect(200);
    expect(corrected.body.renewal.amountMinorUnits).toBe(1399);

    const undone = await request(app)
      .post(`/api/internal/vps/1/renewals/${allowed.body.renewal.id}/undo`)
      .set('x-nono-internal-token', 'nono-to-nomoney-test-token')
      .expect(200);
    expect(undone.body.item.expireDate).toBe('2027-08-10');
  });
});

describe('renewals for phone cards and subscriptions', () => {
  const subscription = {
    name: 'Music',
    purchaseType: 'subscription',
    amountMinorUnits: 1500,
    currency: 'CNY',
    billingCycle: 'monthly',
    nextDueDate: '2026-05-31',
    autoRenew: false,
    status: 'active'
  };

  test('marking a subscription paid advances the next charge and records an expense', async () => {
    const { agent, context } = await setupAgent('nomoney');
    await agent.post('/api/subscriptions').send(subscription).expect(201);

    const response = await agent.post('/api/subscriptions/1/renew')
      .send({ requestId: 'music-2026-05', expectedDueDate: '2026-05-31', amountMinorUnits: 1800 })
      .expect(200);

    expect(response.body.item).toMatchObject({ nextDueDate: '2026-06-30' });
    expect(context.db.all('SELECT asset_type, amount_minor_units, period_start, period_end FROM expenses')).toEqual([
      { asset_type: 'subscription', amount_minor_units: 1800, period_start: '2026-05-31', period_end: '2026-06-30' }
    ]);

    const history = await agent.get('/api/subscriptions/1/renewals').expect(200);
    expect(history.body.items).toEqual([expect.objectContaining({ amountMinorUnits: 1800, status: 'active', auto: false })]);

    await agent.post(`/api/subscriptions/1/renewals/${response.body.renewal.id}/undo`).expect(200);
    expect((await agent.get('/api/subscriptions/1')).body.item.nextDueDate).toBe('2026-05-31');
    expect(context.db.all('SELECT id FROM expenses')).toHaveLength(0);
  });

  test('buyouts cannot be renewed', async () => {
    const { agent } = await setupAgent('nomoney');
    await agent.post('/api/subscriptions').send({ ...subscription, purchaseType: 'buyout' }).expect(201);
    const response = await agent.post('/api/subscriptions/1/renew').send({ requestId: 'buyout-renew', expectedDueDate: '2026-05-31' });
    expect(response.status).toBe(409);
  });

  test('auto-renew rolls overdue items forward once per elapsed cycle and is idempotent', async () => {
    const { agent, context } = await setupAgent('nomoney');
    await agent.post('/api/subscriptions').send({ ...subscription, autoRenew: true, billingCycle: 'weekly', nextDueDate: '2026-05-05' }).expect(201);
    await agent.post('/api/subscriptions').send({ ...subscription, name: 'Stale', autoRenew: true, nextDueDate: '2025-12-01' }).expect(201);
    await agent.post('/api/subscriptions').send({ ...subscription, name: 'Manual', nextDueDate: '2026-05-01' }).expect(201);

    const first = runAutoRenewals(context, ['subscription']);
    const second = runAutoRenewals(context, ['subscription']);

    expect(first.map((item) => item.dueDate)).toEqual(['2026-05-05', '2026-05-12', '2026-05-19']);
    expect(second).toEqual([]);
    expect((await agent.get('/api/subscriptions/1')).body.item.nextDueDate).toBe('2026-05-26');
    expect((await agent.get('/api/subscriptions/2')).body.item.nextDueDate).toBe('2025-12-01');
    expect(context.db.all('SELECT paid_at FROM expenses ORDER BY id')).toEqual([
      { paid_at: '2026-05-05' }, { paid_at: '2026-05-12' }, { paid_at: '2026-05-19' }
    ]);

    await agent.put('/api/settings').send({ autoRenewEnabled: false }).expect(200);
    await agent.post('/api/subscriptions').send({ ...subscription, name: 'Off', autoRenew: true, nextDueDate: '2026-05-10' }).expect(201);
    expect(runAutoRenewals(context, ['subscription'])).toEqual([]);
  });

  test('deleting a renewal expense keeps the renewal undoable', async () => {
    const { agent, context } = await setupAgent('nomoney');
    await agent.post('/api/subscriptions').send(subscription).expect(201);
    const renewed = await agent.post('/api/subscriptions/1/renew')
      .send({ requestId: 'delete-expense', expectedDueDate: '2026-05-31' })
      .expect(200);

    await agent.delete(`/api/expenses/${renewed.body.renewal.expenseId}`).expect(204);
    expect(context.db.get('SELECT expense_id FROM renewal_events')).toEqual({ expense_id: null });

    await agent.post(`/api/subscriptions/1/renewals/${renewed.body.renewal.id}/undo`).expect(200);
  });
});
