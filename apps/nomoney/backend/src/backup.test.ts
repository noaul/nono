import { describe, expect, setupAgent, test } from './test-utils.js';
import { buildBackupPayload, restoreBackupPayload } from './backup.js';

describe('backup APIs', () => {
  test('keeps NoMoney and Yumi backup payloads inside their product boundaries', async () => {
    const { context } = await setupAgent();
    context.db.run("INSERT INTO phones (id, card_number, amount_minor_units, currency, billing_cycle, status, created_at, updated_at) VALUES (10, 'phone', 1, 'CNY', 'monthly', 'active', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO subscriptions (id, name, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (11, 'subscription', 1, 'CNY', 'monthly', 'active', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO vps (id, name, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (20, 'vps', 1, 'USD', 'monthly', 'active', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (21, 'example.com', 1, 'USD', 'annual', 'active', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO expenses (id, asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at) VALUES (30, 'phone', 10, 1, 'CNY', '2026-01-01', 'renewal', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO expenses (id, asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at) VALUES (31, 'vps', 20, 1, 'USD', '2026-01-01', 'renewal', '2026-01-01', '2026-01-01')");

    context.product = 'nomoney';
    const noMoney = buildBackupPayload(context);
    expect(noMoney).toMatchObject({ version: 2, product: 'nomoney' });
    expect(noMoney).toHaveProperty('phones');
    expect(noMoney).toHaveProperty('subscriptions');
    expect(noMoney).toHaveProperty('accounts');
    expect(noMoney).not.toHaveProperty('vps');
    expect(noMoney).not.toHaveProperty('domains');
    expect(noMoney.expenses).toEqual([expect.objectContaining({ id: 30, asset_type: 'phone' })]);

    context.product = 'yumi';
    const yumi = buildBackupPayload(context);
    expect(yumi).toMatchObject({ version: 2, product: 'yumi' });
    expect(yumi).toHaveProperty('vps');
    expect(yumi).toHaveProperty('domains');
    expect(yumi).not.toHaveProperty('phones');
    expect(yumi).not.toHaveProperty('subscriptions');
    expect(yumi).not.toHaveProperty('accounts');
    expect(yumi.expenses).toEqual([expect.objectContaining({ id: 31, asset_type: 'vps' })]);
  });

  test('restores only the current product rows in shared tables', async () => {
    const { context } = await setupAgent();
    context.product = 'nomoney';
    context.db.run("INSERT INTO expenses (id, asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at) VALUES (31, 'vps', 20, 1, 'USD', '2026-01-01', 'renewal', '2026-01-01', '2026-01-01')");
    const payload = buildBackupPayload(context);
    payload.expenses = [{ id: 30, asset_type: 'phone', asset_id: 10, amount_minor_units: 2, currency: 'CNY', paid_at: '2026-02-01', category: 'renewal', created_at: '2026-02-01', updated_at: '2026-02-01' }];

    restoreBackupPayload(context, payload);

    expect(context.db.all<{ id: number; asset_type: string }>('SELECT id, asset_type FROM expenses ORDER BY id')).toEqual([
      { id: 30, asset_type: 'phone' },
      { id: 31, asset_type: 'vps' }
    ]);
  });

  test('rejects a product-scoped backup from the other product', async () => {
    const { context } = await setupAgent();
    context.product = 'nomoney';

    expect(() => restoreBackupPayload(context, { version: 2, product: 'yumi' }))
      .toThrow('Backup belongs to yumi and cannot be restored into nomoney');
  });

  test('downloads backups with the active product name', async () => {
    const { context } = await setupAgent();
    context.product = 'yumi';
    const { createApp } = await import('./app.js');
    const request = (await import('supertest')).default;
    const agent = request.agent(createApp(context));
    await agent.post('/api/auth/login').send({ username: 'owner', password: 'correct horse battery staple' });

    const response = await agent.get('/api/export/json');

    expect(response.headers['content-disposition']).toContain('filename="yumi-backup.json.enc"');
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
      users: 1,
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

    const restoredUser = context.db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE username = ?', ['owner']);
    expect(restoredUser?.password_hash).toMatch(/^\$2/);

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

  test('restoring a backup without renewal events clears only the current product events', async () => {
    const { context } = await setupAgent();
    context.db.run(
      `INSERT INTO renewal_events (
         request_id, asset_type, asset_id, previous_expire_date, renewed_expire_date,
         amount_minor_units, currency, status, created_at
       ) VALUES ('legacy-stale', 'vps', 1, '2026-01-01', '2027-01-01', 1000, 'USD', 'active', '2026-01-01T00:00:00.000Z')`
    );
    context.db.run(
      `INSERT INTO renewal_events (
         request_id, asset_type, asset_id, previous_expire_date, renewed_expire_date,
         amount_minor_units, currency, status, created_at
       ) VALUES ('nomoney-stale', 'phone', 2, '2026-01-01', '2027-01-01', 1000, 'CNY', 'active', '2026-01-01T00:00:00.000Z')`
    );
    const legacyPayload = buildBackupPayload(context);
    delete legacyPayload.renewalEvents;

    restoreBackupPayload(context, legacyPayload);

    expect(context.db.all('SELECT asset_type FROM renewal_events')).toEqual([{ asset_type: 'vps' }]);
  });
});
