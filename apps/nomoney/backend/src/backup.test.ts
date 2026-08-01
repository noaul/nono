import { describe, expect, setupAgent, test } from './test-utils.js';

describe('backup APIs', () => {
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

    await agent.post('/api/domains').send({
      domainName: 'mp',
      domainExtension: 'cc',
      registrar: 'Spaceship',
      dnsProvider: 'Cloudflare',
      amountMinorUnits: 880,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2027-03-01',
      status: 'active'
    });

    await agent.post('/api/vps').send({
      name: 'probe-node',
      vpsType: 'website',
      provider: 'netcup',
      ipAddress: '203.0.113.48',
      location: 'DE',
      cpu: '4 vCPU',
      memory: '8 GB',
      storage: '160 GB NVMe',
      bandwidth: '2 TB',
      os: 'Debian 12',
      sshHost: '203.0.113.48',
      sshPort: 2222,
      sshUser: 'root',
      sshAuthType: 'password',
      sshPassword: 'secret-password',
      sshPrivateKey: null,
      sshPrivateKeyPassphrase: null,
      sshCommand: 'ssh root@203.0.113.48 -p 2222',
      probeUrl: 'https://probe.example.com/api/stat',
      probePort: 9134,
      probeApiKey: 'probe-secret',
      probeInstallStatus: 'installed',
      probeInstallMessage: 'moneypulse-probe-installed',
      probeInstalledAt: '2026-05-22T01:00:00.000Z',
      sshLastTestStatus: 'success',
      sshLastTestMessage: 'moneypulse-ssh-ok',
      sshLastTestedAt: '2026-05-22T01:00:00.000Z',
      monitorStatus: 'online',
      monitorCpuPercent: 22,
      monitorMemoryPercent: 31,
      monitorDiskPercent: 44,
      monitorNetInBps: 1024,
      monitorNetOutBps: 2048,
      monitorNetTotalInBytes: 4096,
      monitorNetTotalOutBytes: 8192,
      monitorLoad1: 0.2,
      monitorUptimeSeconds: 3600,
      monitorUpdatedAt: '2026-05-22T01:00:00.000Z',
      amountMinorUnits: 8900,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-10',
      startDate: '2026-01-01',
      expireDate: '2027-01-01',
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
      vps: 1,
      domains: 1,
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

    await agent.put('/api/domains/1').send({
      domainName: 'ordinary-long-domain-name',
      domainExtension: 'net'
    });
    await agent.put('/api/vps/1').send({
      sshHost: '198.51.100.10',
      monitorStatus: 'offline'
    });
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

    const restored = await agent.get('/api/domains');
    expect(restored.body.items).toEqual([
      expect.objectContaining({
        domainName: 'mp.cc',
        domainExtension: '.cc',
        rarityScore: 80
      })
    ]);

    const restoredVps = await agent.get('/api/vps');
    expect(restoredVps.body.items).toEqual([
      expect.objectContaining({
        name: 'probe-node',
        vpsType: 'website',
        sshHost: '203.0.113.48',
        sshPort: 2222,
        sshAuthType: 'password',
        sshPassword: null,
        hasSshPassword: true,
        probeUrl: 'https://probe.example.com/api/stat',
        probePort: 9134,
        probeApiKey: null,
        hasProbeApiKey: true,
        probeInstallStatus: 'installed',
        sshLastTestStatus: 'success',
        monitorStatus: 'online',
        monitorCpuPercent: 22,
        monitorMemoryPercent: 31,
        monitorDiskPercent: 44
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
});
