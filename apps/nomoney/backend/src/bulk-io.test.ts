import { describe, expect, setupAgent, test } from './test-utils.js';
import { parseCsv, toCsv } from './bulk-io.js';

const subscription = { purchaseType: 'subscription', amountMinorUnits: 1500, currency: 'CNY', billingCycle: 'monthly', status: 'active' };

describe('bulk actions', () => {
  test('trashes, restores, retags and changes status for many items at once', async () => {
    const { agent } = await setupAgent('nomoney');
    for (const name of ['A', 'B', 'C']) await agent.post('/api/subscriptions').send({ ...subscription, name, tags: ['x'] }).expect(201);

    expect((await agent.post('/api/subscriptions/bulk').send({ ids: [1, 2], action: 'addTag', tag: 'work' })).body).toEqual({ changed: 2 });
    expect((await agent.post('/api/subscriptions/bulk').send({ ids: [1, 2, 3], action: 'status', status: 'paused' })).body).toEqual({ changed: 3 });
    expect((await agent.post('/api/subscriptions/bulk').send({ ids: [2, 3], action: 'trash' })).body).toEqual({ changed: 2 });

    const list = await agent.get('/api/subscriptions').expect(200);
    expect(list.body.items).toEqual([expect.objectContaining({ name: 'A', status: 'paused', tags: ['x', 'work'] })]);

    expect((await agent.post('/api/subscriptions/bulk').send({ ids: [3], action: 'purge' })).body).toEqual({ changed: 1 });
    expect((await agent.post('/api/subscriptions/bulk').send({ ids: [2], action: 'restore' })).body).toEqual({ changed: 1 });
    expect((await agent.get('/api/subscriptions')).body.items).toHaveLength(2);
  });
});

describe('CSV export and import', () => {
  test('round-trips subscriptions with decimal money and tags', async () => {
    const { agent } = await setupAgent('nomoney');
    await agent.post('/api/subscriptions').send({ ...subscription, name: 'Video, HD', tags: ['a', 'b'], notes: '=cmd' }).expect(201);

    const exported = await agent.get('/api/subscriptions/export.csv').expect(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    const rows = parseCsv(exported.text.replace(/^﻿/, '').trim());
    const header = rows[0];
    const row = Object.fromEntries(header.map((key, index) => [key, rows[1][index]]));
    expect(row).toMatchObject({ name: 'Video, HD', amount: '15.00', currency: 'CNY', tags: 'a; b', notes: "'=cmd" });

    const imported = await agent.post('/api/subscriptions/import').send({ csv: exported.text }).expect(200);
    expect(imported.body).toMatchObject({ imported: 1, errors: [] });
    expect(imported.body.items[0]).toMatchObject({ name: 'Video, HD', amountMinorUnits: 1500, tags: ['a', 'b'] });
  });

  test('imports nothing when any row is invalid and reports the row number', async () => {
    const { agent } = await setupAgent('nomoney');
    const csv = 'name,amount,currency,billingCycle,purchaseType,status\nGood,9.90,CNY,monthly,subscription,active\nBad,1,XYZ,monthly,subscription,active\n';

    const response = await agent.post('/api/subscriptions/import').send({ csv }).expect(200);

    expect(response.body.imported).toBe(0);
    expect(response.body.errors).toEqual([expect.objectContaining({ row: 3 })]);
    expect((await agent.get('/api/subscriptions')).body.items).toHaveLength(0);
  });

  test('parses quoted CSV fields', () => {
    expect(parseCsv('a,"b ""q"", c"\r\n1,2')).toEqual([['a', 'b "q", c'], ['1', '2']]);
    expect(toCsv([['x,y', '+1', '-2.5']])).toBe('"x,y",\'+1,-2.5');
  });
});
