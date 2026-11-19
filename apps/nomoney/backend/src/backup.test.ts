import { adminCookie, describe, expect, setupAgent, test } from './test-utils.js';
import { encryptSecret } from './secret-crypto.js';
import { buildBackupPayload, restoreBackupPayload } from './backup.js';

describe('backup APIs', () => {
  test('rejects a backup with a different application key before replacing live data', async () => {
    const { context } = await setupAgent();
    const payload = buildBackupPayload(context);
    const before = context.db.all('SELECT * FROM settings');
    payload.settings = [{ key: 'webdavPassword', value: JSON.stringify(encryptSecret('old-secret', 'a'.repeat(64))) }];
    expect(() => restoreBackupPayload(context, payload)).toThrow('different application key');
    expect(context.db.all('SELECT * FROM settings')).toEqual(before);
  });
  test('backs up phone cards, domains, subscriptions and accounts in one NoMoney payload', async () => {
    const { context } = await setupAgent();
    context.db.run("INSERT INTO phones (id, card_number, amount_minor_units, currency, billing_cycle, status, created_at, updated_at) VALUES (10, 'phone', 1, 'CNY', 'monthly', 'active', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (21, 'example.com', 1, 'USD', 'annual', 'active', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO expenses (id, asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at) VALUES (30, 'phone', 10, 1, 'CNY', '2026-01-01', 'renewal', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO expenses (id, asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at) VALUES (31, 'domain', 21, 1, 'USD', '2026-01-01', 'renewal', '2026-01-01', '2026-01-01')");

    const payload = buildBackupPayload(context);

    expect(payload).toMatchObject({ version: 3, product: 'nomoney' });
    for (const key of ['phones', 'domains', 'subscriptions', 'accounts']) expect(payload).toHaveProperty(key);
    expect(payload).not.toHaveProperty('vps');
    expect(payload).not.toHaveProperty('vpsStatusSamples');
    expect(payload.expenses).toEqual([
      expect.objectContaining({ id: 30, asset_type: 'phone' }),
      expect.objectContaining({ id: 31, asset_type: 'domain' })
    ]);
  });

  test('restoring a backup from before the merge keeps the current domains and their ledger', async () => {
    const { context } = await setupAgent();
    context.db.run("INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (21, 'kept.com', 1, 'USD', 'annual', 'active', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO expenses (id, asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at) VALUES (31, 'domain', 21, 1, 'USD', '2026-01-01', 'renewal', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('yumiMergeVersion', '1')");
    const payload = buildBackupPayload(context);
    delete payload.domains;
    payload.version = 2;
    payload.expenses = [
      { id: 30, asset_type: 'phone', asset_id: 10, amount_minor_units: 2, currency: 'CNY', paid_at: '2026-02-01', category: 'renewal', created_at: '2026-02-01', updated_at: '2026-02-01' }
    ];
    payload.settings = (payload.settings as Array<{ key: string }>).filter((row) => row.key !== 'yumiMergeVersion');

    restoreBackupPayload(context, payload);

    expect(context.db.all<{ id: number; asset_type: string }>('SELECT id, asset_type FROM expenses ORDER BY id')).toEqual([
      { id: 30, asset_type: 'phone' },
      { id: 31, asset_type: 'domain' }
    ]);
    expect(context.db.get('SELECT domain_name FROM domains WHERE id = 21')).toEqual({ domain_name: 'kept.com' });
    expect(context.db.get('SELECT value FROM settings WHERE key = ?', ['yumiMergeVersion'])).toEqual({ value: '1' });
  });

  test('drops VPS rows from older backups', async () => {
    const { context } = await setupAgent();
    const payload = buildBackupPayload(context);
    delete payload.product;
    payload.vps = [{ id: 20, name: 'old', amount_minor_units: 1, currency: 'USD', billing_cycle: 'monthly', status: 'active' }];
    payload.expenses = [{ id: 31, asset_type: 'vps', asset_id: 20, amount_minor_units: 1, currency: 'USD', paid_at: '2026-01-01', category: 'renewal', created_at: '2026-01-01', updated_at: '2026-01-01' }];

    restoreBackupPayload(context, payload);

    expect(context.db.all('SELECT id FROM expenses')).toEqual([]);
  });

  test('rejects a Yumi backup', async () => {
    const { context } = await setupAgent();

    expect(() => restoreBackupPayload(context, { version: 2, product: 'yumi' })).toThrow('Yumi has been retired');
  });

  test('downloads backups with the NoMoney file name', async () => {
    const { agent } = await setupAgent();

    const response = await agent.get('/api/export/json');

    expect(response.headers['content-disposition']).toContain('filename="nomoney-backup.json.enc"');
  });

  test('backs up to WebDAV and restores data from the WebDAV backup', async () => {
    const { agent, context } = await setupAgent();
    let uploaded = '';
    let uploadedUrl = '';

    context.fetch = async (url, init) => {
      if (init?.method === 'PUT') {
        uploadedUrl = String(url);
        uploaded = String(init.body ?? '');
        return new Response(null, { status: 201 });
      }
      if (init?.method === 'GET') {
        return new Response(uploaded, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(null, { status: 405 });
    };

    await agent.put('/api/settings').send({
      webdavUrl: 'https://dav.example.com/remote.php/dav/files/owner',
      webdavUsername: 'owner',
      webdavPassword: 'secret',
      webdavFolderPath: 'backups/moneypulse',
      webdavBackupFilename: 'assets.json.enc',
      webdavEncryptionKey: 'backup-passphrase'
    });

    await agent.post('/api/phones').send({
      phoneType: 'foreign',
      isEsim: true,
      cardNumber: '+4915112345678',
      carrier: 'Telekom',
      planName: 'Data S',
      amountMinorUnits: 990,
      currency: 'EUR',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-15',
      status: 'active'
    });

    await agent.post('/api/subscriptions').send({
      name: 'ChatGPT',
      purchaseType: 'buyout',
      provider: 'OpenAI',
      account: 'owner@example.com',
      email: 'owner@example.com',
      phoneNumber: '+16045550123',
      licenseKey: 'secret-license',
      deviceLimit: 3,
      content: 'Desktop app',
      category: 'AI',
      amountMinorUnits: 2000,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-20',
      status: 'active'
    });

    await agent.post('/api/accounts').send({
      accountType: 'telegram',
      phoneNumber: '13800138000',
      countryCallingCode: '+86',
      countryIso: 'CN',
      boundEmail: 'telegram@example.com',
      loginDevice: 'iPhone 15 Pro',
      displayName: '主 Telegram'
    });

    const backup = await agent.post('/api/backup/webdav').send();
    expect(backup.status).toBe(200);
    expect(uploadedUrl).toBe('https://dav.example.com/remote.php/dav/files/owner/backups/moneypulse/assets.json.enc');
    expect(uploaded).not.toContain('"domains"');
    expect(uploaded).not.toContain('secret-password');
    expect(uploaded).not.toContain('+4915112345678');
    const envelope = JSON.parse(uploaded);
    expect(envelope).toMatchObject({
      version: 2,
      kind: 'moneypulse.webdav.encrypted',
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt'
    });
    expect(envelope.ciphertext).toEqual(expect.any(String));
    expect(backup.body.counts).toMatchObject({
      phones: 1,
      subscriptions: 1,
      accounts: 1,
      settings: expect.any(Number)
    });

    const exported = await agent.get('/api/export/json');
    const exportedText = JSON.stringify(exported.body);
    expect(exported.status).toBe(200);
    expect(exported.body).toMatchObject({
      version: 2,
      kind: 'moneypulse.webdav.encrypted',
      algorithm: 'aes-256-gcm'
    });
    expect(exportedText).not.toContain('secret-password');
    expect(exportedText).not.toContain('+4915112345678');
    expect(exportedText).not.toContain('backup-passphrase');
    expect(exportedText).not.toContain('secret-license');

    await agent.put('/api/phones/1').send({
      carrier: 'Changed Carrier'
    });
    await agent.put('/api/subscriptions/1').send({
      provider: 'Changed Provider'
    });
    await agent.put('/api/accounts/1').send({
      boundEmail: 'changed@example.com'
    });

    const restore = await agent.post('/api/backup/restore').send();
    expect(restore.status).toBe(200);

    // Accounts live in NoNo, so a restore no longer signs the browser out.

    const restoredPhones = await agent.get('/api/phones');
    expect(restoredPhones.body.items).toEqual([
      expect.objectContaining({
        cardNumber: '+4915112345678',
        isEsim: true,
        carrier: 'Telekom',
        planName: 'Data S'
      })
    ]);

    const restoredSubscriptions = await agent.get('/api/subscriptions');
    expect(restoredSubscriptions.body.items).toEqual([
      expect.objectContaining({
        name: 'ChatGPT',
        provider: 'OpenAI',
        purchaseType: 'buyout',
        email: 'owner@example.com',
        phoneNumber: '+16045550123',
        licenseKey: 'secret-license',
        deviceLimit: 3,
        content: 'Desktop app'
      })
    ]);

    const restoredAccounts = await agent.get('/api/accounts');
    expect(restoredAccounts.body.items).toEqual([
      expect.objectContaining({
        accountType: 'telegram',
        phoneNumber: '13800138000',
        boundEmail: 'telegram@example.com',
        loginDevice: 'iPhone 15 Pro',
        displayName: '主 Telegram'
      })
    ]);

    const leftoverAccounts = context.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM sqlite_master WHERE name IN ('users', 'auth_sessions')");
    expect(Number(leftoverAccounts?.count)).toBe(0);

    const restoredSettings = await agent.get('/api/settings');
    expect(restoredSettings.body.settings).toMatchObject({
      webdavFolderPath: 'backups/moneypulse',
      webdavBackupFilename: 'assets.json.enc',
      webdavPassword: '',
      webdavPasswordSet: true,
      webdavEncryptionKey: '',
      webdavEncryptionKeySet: true
    });
  });

  test('restoring a backup without renewal events clears only the asset types it carries', async () => {
    const { context } = await setupAgent();
    context.db.run(
      `INSERT INTO renewal_events (
         request_id, asset_type, asset_id, previous_expire_date, renewed_expire_date,
         amount_minor_units, currency, status, created_at
       ) VALUES ('domain-kept', 'domain', 1, '2026-01-01', '2027-01-01', 1000, 'USD', 'active', '2026-01-01T00:00:00.000Z')`
    );
    context.db.run(
      `INSERT INTO renewal_events (
         request_id, asset_type, asset_id, previous_expire_date, renewed_expire_date,
         amount_minor_units, currency, status, created_at
       ) VALUES ('nomoney-stale', 'phone', 2, '2026-01-01', '2027-01-01', 1000, 'CNY', 'active', '2026-01-01T00:00:00.000Z')`
    );
    const legacyPayload = buildBackupPayload(context);
    delete legacyPayload.renewalEvents;
    delete legacyPayload.domains;

    restoreBackupPayload(context, legacyPayload);

    expect(context.db.all('SELECT asset_type FROM renewal_events')).toEqual([{ asset_type: 'domain' }]);
  });

  test('exposes backup and restore only to the internal Nono service token', async () => {
    const { context, app } = await setupAgent();
    const request = (await import('supertest')).default;
    context.db.run("INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (20, 'before.com', 1, 'USD', 'annual', 'active', '[]', '2026-01-01', '2026-01-01')");

    expect((await request(app).get('/api/internal/backup')).status).toBe(401);

    const exported = await request(app)
      .get('/api/internal/backup')
      .set('x-nono-internal-token', 'test-internal-token');
    expect(exported.status).toBe(200);
    expect(exported.body).toMatchObject({ product: 'nomoney', version: 3 });

    context.db.run("UPDATE domains SET domain_name = 'changed.com' WHERE id = 20");
    const restored = await request(app)
      .post('/api/internal/backup/restore')
      .set('x-nono-internal-token', 'test-internal-token')
      .send(exported.body);
    expect(restored.status).toBe(200);
    expect(context.db.get('SELECT domain_name FROM domains WHERE id = 20')).toEqual({ domain_name: 'before.com' });
  });
});

describe('backup file upload', () => {
  test('restores an exported encrypted backup file', async () => {
    const { agent } = await setupAgent();
    await agent.put('/api/settings').send({ webdavEncryptionKey: 'file-backup-key' }).expect(200);
    await agent.post('/api/subscriptions').send({ name: 'Keep me', purchaseType: 'subscription', amountMinorUnits: 100, currency: 'CNY', billingCycle: 'monthly', status: 'active' }).expect(201);
    const exported = await agent.get('/api/export/json').expect(200);
    await agent.delete('/api/subscriptions/1').expect(204);
    await agent.delete('/api/subscriptions/1/permanent').expect(204);

    const restored = await agent.post('/api/backup/restore-file').send(exported.body).expect(200);

    expect(restored.body.ok).toBe(true);
    const list = await agent.get('/api/subscriptions');
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.items).toEqual([expect.objectContaining({ name: 'Keep me' })]);
  });

  test('checks the session before reading an upload body, then accepts bodies over the default 1 MB limit', async () => {
    const request = (await import('supertest')).default;
    const { app, agent, context } = await setupAgent();
    let verified = 0;
    const verifySession = context.verifySession;
    context.verifySession = async (token) => {
      verified += 1;
      return verifySession(token);
    };

    const anonymous = await request(app)
      .post('/api/backup/restore-file')
      .set('content-type', 'application/json')
      .send('{"not json');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');

    const large = { ...buildBackupPayload(context), padding: 'x'.repeat(2 * 1024 * 1024) };
    const restored = await agent.post('/api/backup/restore-file').send(large);
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect(verified).toBeGreaterThan(0);
  });
});
