import request from 'supertest';
import { createApp } from './app.js';
import { createTestContext, describe, expect, setupAgent, test } from './test-utils.js';

const telegramAccount = {
  accountType: 'telegram',
  phoneNumber: '138 0013 8000',
  countryCallingCode: '+86',
  countryIso: 'CN',
  boundEmail: 'telegram@example.com',
  loginDevice: 'iPhone 15 Pro',
  displayName: '工作 Telegram',
  notes: '日常联系'
};

describe('account APIs', () => {
  test('requires authentication', async () => {
    const context = await createTestContext();
    const response = await request(createApp(context)).get('/api/accounts');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  test('creates, filters, updates, and deletes communication accounts', async () => {
    const { agent } = await setupAgent();

    const telegram = await agent.post('/api/accounts').send(telegramAccount);
    expect(telegram.status).toBe(201);
    expect(telegram.body.item).toMatchObject({
      id: 1,
      ...telegramAccount,
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z'
    });

    const whatsapp = await agent.post('/api/accounts').send({
      accountType: 'whatsapp',
      phoneNumber: '20 7946 0958',
      countryCallingCode: '+44',
      countryIso: 'GB',
      boundEmail: 'whatsapp@example.com'
    });
    expect(whatsapp.status).toBe(201);

    const filtered = await agent.get('/api/accounts?phone=0013&accountType=telegram');
    expect(filtered.status).toBe(200);
    expect(filtered.body.meta).toEqual({ total: 1 });
    expect(filtered.body.items).toEqual([expect.objectContaining({ id: 1, accountType: 'telegram' })]);

    const updated = await agent.put('/api/accounts/1').send({
      boundEmail: 'new-telegram@example.com',
      loginDevice: 'MacBook Pro',
      displayName: '主 Telegram'
    });
    expect(updated.status).toBe(200);
    expect(updated.body.item).toMatchObject({
      id: 1,
      boundEmail: 'new-telegram@example.com',
      loginDevice: 'MacBook Pro',
      displayName: '主 Telegram'
    });

    const removed = await agent.delete('/api/accounts/1');
    expect(removed.status).toBe(204);
    const remaining = await agent.get('/api/accounts');
    expect(remaining.body.meta).toEqual({ total: 1 });
    expect(remaining.body.items).toEqual([expect.objectContaining({ id: 2, accountType: 'whatsapp' })]);
  });

  test('validates account identity fields and rejects duplicate app numbers', async () => {
    const { agent } = await setupAgent();

    const invalid = await agent.post('/api/accounts').send({
      accountType: 'telegram',
      phoneNumber: '<script>',
      countryCallingCode: '86',
      countryIso: 'CHN',
      boundEmail: 'not-an-email'
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const punctuationOnly = await agent.post('/api/accounts').send({
      ...telegramAccount,
      phoneNumber: '----'
    });
    expect(punctuationOnly.status).toBe(400);

    expect((await agent.post('/api/accounts').send(telegramAccount)).status).toBe(201);
    const duplicate = await agent.post('/api/accounts').send({
      ...telegramAccount,
      boundEmail: 'other@example.com'
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ACCOUNT_ALREADY_EXISTS');

    const sameNumberDifferentApp = await agent.post('/api/accounts').send({
      ...telegramAccount,
      accountType: 'whatsapp',
      boundEmail: 'whatsapp@example.com'
    });
    expect(sameNumberDifferentApp.status).toBe(201);
  });

  test('accepts omitted, blank, or null bound emails', async () => {
    const { agent } = await setupAgent();
    const account = {
      accountType: 'telegram',
      countryCallingCode: '+852',
      countryIso: 'HK'
    };

    const omitted = await agent.post('/api/accounts').send({ ...account, phoneNumber: '94136834' });
    const blank = await agent.post('/api/accounts').send({ ...account, phoneNumber: '94136835', boundEmail: '   ' });
    const nullEmail = await agent.post('/api/accounts').send({ ...account, phoneNumber: '94136836', boundEmail: null });

    expect(omitted.status).toBe(201);
    expect(blank.status).toBe(201);
    expect(nullEmail.status).toBe(201);
    expect([omitted.body.item.boundEmail, blank.body.item.boundEmail, nullEmail.body.item.boundEmail]).toEqual(['', '', '']);
  });

  test('moves accounts to trash, restores them, and permanently deletes them', async () => {
    const { agent } = await setupAgent();
    expect((await agent.post('/api/accounts').send(telegramAccount)).status).toBe(201);

    const activeDelete = await agent.delete('/api/accounts/1/permanent');
    expect(activeDelete.status).toBe(409);
    expect(activeDelete.body.error.code).toBe('ACCOUNT_NOT_TRASHED');

    await agent.delete('/api/accounts/1').expect(204);
    expect((await agent.get('/api/accounts')).body.meta).toEqual({ total: 0 });

    const trashed = await agent.get('/api/accounts?trashed=true');
    expect(trashed.body.meta).toEqual({ total: 1 });
    expect(trashed.body.items[0].archivedAt).toMatch(/^2026-05-22/);

    const restored = await agent.post('/api/accounts/1/restore').send();
    expect(restored.status).toBe(200);
    expect(restored.body.item.archivedAt).toBeNull();
    expect((await agent.get('/api/accounts')).body.meta).toEqual({ total: 1 });

    await agent.delete('/api/accounts/1').expect(204);
    await agent.delete('/api/accounts/1/permanent').expect(204);
    expect((await agent.get('/api/accounts?trashed=true')).body.meta).toEqual({ total: 0 });
  });

  test('rejects unknown account types and missing records', async () => {
    const { agent } = await setupAgent();
    const unknownType = await agent.post('/api/accounts').send({
      ...telegramAccount,
      accountType: 'unknown-app'
    });
    expect(unknownType.status).toBe(400);

    const missing = await agent.put('/api/accounts/999').send({ boundEmail: 'missing@example.com' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});
