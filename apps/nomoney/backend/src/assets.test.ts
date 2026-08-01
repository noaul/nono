import { describe, expect, setupAgent, test } from './test-utils.js';

describe('asset APIs', () => {
  test('stores domestic and foreign phone card profile fields', async () => {
    const { agent } = await setupAgent();

    const domestic = await agent.post('/api/phones').send({
      phoneType: 'domestic',
      cardNumber: '+8613800000000',
      poPhoneNumber: 'PO-10086',
      carrier: 'China Mobile',
      realNamePerson: 'Alice',
      userName: 'Bob',
      isSecondaryCard: true,
      dataAllowanceGb: 80,
      voiceMinutes: 500,
      monthlyRentMinorUnits: 3900,
      attachedServices: '宽带副卡',
      attachedServicesMinorUnits: 600,
      discountMinorUnits: 1000,
      cashbackMinorUnits: 500,
      amountMinorUnits: 2400,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-01',
      notes: 'Domestic family plan',
      status: 'active'
    });

    expect(domestic.status).toBe(201);
    expect(domestic.body.item).toMatchObject({
      phoneType: 'domestic',
      isEsim: false,
      cardNumber: '+8613800000000',
      poPhoneNumber: 'PO-10086',
      realNamePerson: 'Alice',
      userName: 'Bob',
      isSecondaryCard: true,
      dataAllowanceGb: 80,
      voiceMinutes: 500,
      monthlyRentMinorUnits: 3900,
      attachedServices: '宽带副卡',
      attachedServicesMinorUnits: 600,
      discountMinorUnits: 1000,
      cashbackMinorUnits: 500,
      amountMinorUnits: 3000
    });

    const foreign = await agent.post('/api/phones').send({
      phoneType: 'foreign',
      isEsim: true,
      cardNumber: '+12025550188',
      countryCode: '+1',
      homeLocation: 'US',
      aPhoneNumber: '+12025550188',
      mainlandNumber: '+8613911111111',
      carrier: 'T-Mobile',
      realNameMethod: 'Passport',
      balanceMinorUnits: 1250,
      totalKeepaliveUntil: '2027-01-15',
      keepaliveMethod: 'Top-up',
      minimumKeepaliveAmountMinorUnits: 500,
      keepaliveDays: 90,
      amountMinorUnits: 500,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-15',
      status: 'active'
    });

    expect(foreign.status).toBe(201);
    expect(foreign.body.item).toMatchObject({
      phoneType: 'foreign',
      isEsim: true,
      countryCode: '+1',
      homeLocation: 'US',
      aPhoneNumber: '+12025550188',
      mainlandNumber: '+8613911111111',
      carrier: 'T-Mobile',
      realNameMethod: 'Passport',
      balanceMinorUnits: 1250,
      totalKeepaliveUntil: '2027-01-15',
      keepaliveMethod: 'Top-up',
      minimumKeepaliveAmountMinorUnits: 500,
      keepaliveDays: 90
    });

    const list = await agent.get('/api/phones?q=t-mobile');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      phoneType: 'foreign',
      cardNumber: '+12025550188',
      carrier: 'T-Mobile'
    });
  });

  test('calculates domestic phone monthly cost from rent, attached services, discount, and cashback', async () => {
    const { agent } = await setupAgent();

    const created = await agent.post('/api/phones').send({
      phoneType: 'domestic',
      cardNumber: '+8613711111111',
      carrier: 'China Unicom',
      monthlyRentMinorUnits: 3900,
      attachedServicesMinorUnits: 600,
      discountMinorUnits: 1000,
      cashbackMinorUnits: 500,
      amountMinorUnits: 999999,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-01',
      status: 'active'
    });

    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({
      monthlyRentMinorUnits: 3900,
      attachedServicesMinorUnits: 600,
      discountMinorUnits: 1000,
      cashbackMinorUnits: 500,
      amountMinorUnits: 3000
    });

    const updated = await agent.put('/api/phones/1').send({
      attachedServicesMinorUnits: 1200,
      discountMinorUnits: 800,
      cashbackMinorUnits: 300
    });

    expect(updated.status).toBe(200);
    expect(updated.body.item).toMatchObject({
      monthlyRentMinorUnits: 3900,
      attachedServicesMinorUnits: 1200,
      discountMinorUnits: 800,
      cashbackMinorUnits: 300,
      amountMinorUnits: 4000
    });
  });

  test('creates, lists, updates, and archives subscriptions', async () => {
    const { agent } = await setupAgent();

    const created = await agent.post('/api/subscriptions').send({
      name: 'ChatGPT',
      provider: 'OpenAI',
      account: 'owner@example.com',
      category: 'AI',
      amountMinorUnits: 2000,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-01',
      autoRenew: true,
      paymentMethod: 'Visa',
      status: 'active',
      tags: ['ai', 'work'],
      renewalUrl: 'https://chatgpt.com',
      notes: 'Primary AI subscription'
    });

    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({
      id: 1,
      name: 'ChatGPT',
      currency: 'USD',
      amountMinorUnits: 2000,
      tags: ['ai', 'work']
    });

    const list = await agent.get('/api/subscriptions?status=active&q=chat');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const updated = await agent.put('/api/subscriptions/1').send({
      amountMinorUnits: 2200,
      notes: 'Updated price'
    });
    expect(updated.body.item.amountMinorUnits).toBe(2200);

    await agent.delete('/api/subscriptions/1').expect(204);

    const archivedList = await agent.get('/api/subscriptions?status=archived');
    expect(archivedList.body.items[0].status).toBe('archived');
    expect(archivedList.body.items[0].archivedAt).toMatch(/^2026-05-22/);

    const restored = await agent.post('/api/subscriptions/1/restore').send();
    expect(restored.status).toBe(200);
    expect(restored.body.item).toMatchObject({ status: 'active', archivedAt: null });
    expect((await agent.get('/api/subscriptions')).body.items).toHaveLength(1);
  });

  test('permanently deletes assets and their linked expenses', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/domains').send({
      domainName: 'delete-me.com',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2027-01-01',
      status: 'active'
    });

    await agent.post('/api/expenses').send({
      assetType: 'domain',
      assetId: 1,
      amountMinorUnits: 1200,
      currency: 'USD',
      paidAt: '2026-05-22',
      category: 'renewal'
    });

    const activeDelete = await agent.delete('/api/domains/1/permanent');
    expect(activeDelete.status).toBe(409);
    expect(activeDelete.body.error.code).toBe('ASSET_NOT_ARCHIVED');

    await agent.delete('/api/domains/1').expect(204);
    await agent.delete('/api/domains/1/permanent').expect(204);

    await agent.get('/api/domains/1').expect(404);
    const domains = await agent.get('/api/domains?status=active');
    expect(domains.body.items).toHaveLength(0);

    const expenses = await agent.get('/api/expenses?assetType=domain');
    expect(expenses.body.items).toHaveLength(0);
  });

  test('validates currency and money fields', async () => {
    const { agent } = await setupAgent();

    const response = await agent.post('/api/domains').send({
      domainName: 'example.com',
      registrar: 'Cloudflare',
      amountMinorUnits: 12.5,
      currency: 'JPY',
      billingCycle: 'annual',
      expireDate: '2026-06-01',
      status: 'active'
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('accepts Canadian dollars for assets', async () => {
    const { agent } = await setupAgent();

    const response = await agent.post('/api/vps').send({
      name: 'Canada VPS',
      amountMinorUnits: 1000,
      currency: 'CAD',
      billingCycle: 'annual',
      expireDate: '2027-07-25',
      status: 'active'
    });

    expect(response.status).toBe(201);
    expect(response.body.item.currency).toBe('CAD');

    const lookup = await agent.get('/api/assets/lookup');
    expect(lookup.body.items).toEqual([
      expect.objectContaining({ label: 'Canada VPS', currency: 'CAD' })
    ]);
  });

  test('stores and filters VPS types', async () => {
    const { agent } = await setupAgent();
    const base = {
      amountMinorUnits: 1000,
      currency: 'CAD',
      billingCycle: 'annual',
      expireDate: '2027-07-25',
      status: 'active'
    };

    await agent.post('/api/vps').send({ ...base, name: 'Web', vpsType: 'website' }).expect(201);
    await agent.post('/api/vps').send({ ...base, name: 'Route', vpsType: 'route' }).expect(201);
    await agent.post('/api/vps').send({ ...base, name: 'Home', vpsType: 'residential' }).expect(201);

    const response = await agent.get('/api/vps?vpsType=route');
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({ name: 'Route', vpsType: 'route' })
    ]);
  });

  test('stores, exposes, searches, and updates buyout details', async () => {
    const { agent, context } = await setupAgent();

    const created = await agent.post('/api/subscriptions').send({
      name: 'Lifetime Tool',
      purchaseType: 'buyout',
      provider: 'Vendor',
      email: 'owner@example.com',
      phoneNumber: '+16045550123',
      licenseKey: 'secret-license',
      deviceLimit: 3,
      content: 'Desktop and mobile apps',
      amountMinorUnits: 4900,
      currency: 'CAD',
      billingCycle: 'annual',
      nextDueDate: '2026-05-25',
      autoRenew: true,
      renewalUrl: 'https://vendor.example/renew',
      status: 'active'
    });

    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({
      purchaseType: 'buyout',
      email: 'owner@example.com',
      phoneNumber: '+16045550123',
      licenseKey: 'secret-license',
      deviceLimit: 3,
      content: 'Desktop and mobile apps',
      nextDueDate: null,
      autoRenew: false,
      renewalUrl: null
    });
    const storedLicense = context.db.get<{ license_key: string }>('SELECT license_key FROM subscriptions WHERE id = 1');
    expect(storedLicense?.license_key).toBe('secret-license');

    const filtered = await agent.get('/api/subscriptions?purchaseType=buyout&q=secret-license');
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0]).toMatchObject({
      name: 'Lifetime Tool',
      purchaseType: 'buyout',
      licenseKey: 'secret-license'
    });

    await agent.put('/api/subscriptions/1').send({ licenseKey: '', deviceLimit: 5 }).expect(200);
    const updated = await agent.get('/api/subscriptions/1');
    expect(updated.body.item).toMatchObject({ licenseKey: null, deviceLimit: 5 });
    expect(updated.body.item).not.toHaveProperty('hasLicenseKey');
  });

  test('migrates the legacy VPS due date without losing it on later edits', async () => {
    const { agent, context } = await setupAgent();

    const id = context.db.insert(
      `INSERT INTO vps (
        name, amount_minor_units, currency, billing_cycle, next_due_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Legacy VPS', 1200, 'USD', 'monthly', '2026-06-10', 'active', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z']
    );

    const updated = await agent.put(`/api/vps/${id}`).send({ provider: 'Legacy Provider' });

    expect(updated.status).toBe(200);
    expect(updated.body.item).toMatchObject({
      provider: 'Legacy Provider',
      expireDate: '2026-06-10',
      nextDueDate: null
    });
  });

  test('filters, paginates, and sorts asset lists with metadata', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/subscriptions').send({
      name: 'Alpha',
      provider: 'OpenAI',
      account: 'owner@example.com',
      category: 'AI',
      amountMinorUnits: 2000,
      currency: 'USD',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-01',
      autoRenew: true,
      status: 'active'
    });

    await agent.post('/api/subscriptions').send({
      name: 'Beta',
      provider: 'Anthropic',
      account: 'owner@example.com',
      category: 'AI',
      amountMinorUnits: 6000,
      currency: 'USD',
      billingCycle: 'annual',
      nextDueDate: '2026-05-28',
      autoRenew: false,
      status: 'active'
    });

    await agent.post('/api/subscriptions').send({
      name: 'Gamma',
      provider: 'Apple',
      account: 'owner@example.com',
      category: 'Cloud',
      amountMinorUnits: 210,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-05-24',
      autoRenew: true,
      status: 'active'
    });

    const response = await agent.get(
      '/api/subscriptions?status=active&currency=USD&billingCycle=annual&sort=amount&direction=desc&limit=1&offset=0'
    );

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ total: 1, limit: 1, offset: 0 });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        name: 'Beta',
        currency: 'USD',
        billingCycle: 'annual',
        amountMinorUnits: 6000
      })
    ]);
  });

  test('stores VPS SSH and probe fields and normalizes live monitor snapshots', async () => {
    const { agent, context } = await setupAgent();
    let requestedUrl = '';
    let requestedAuth = '';
    context.fetch = async (url, init) => {
      requestedUrl = String(url);
      requestedAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
      return new Response(JSON.stringify({
        sid: 'node-1',
        stat: {
          cpu: { multi: 0.42 },
          mem: {
            virtual: { used: 2_147_483_648, total: 4_294_967_296 }
          },
          disk: { used: 10_737_418_240, total: 53_687_091_200 },
          net: {
            delta: { in: 125_000, out: 64_000 },
            total: { in: 2_147_483_648, out: 1_073_741_824 }
          },
          load: { load1: 0.4, load5: 0.3, load15: 0.2 },
          uptime: 86_400
        }
      }), { status: 200 });
    };

    const created = await agent.post('/api/vps').send({
      name: 'nc48',
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
      sshCommand: 'ssh root@203.0.113.48 -p 2222',
      probeUrl: 'https://probe.example.com/api/stat',
      probeApiKey: 'probe-secret',
      amountMinorUnits: 8900,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-10',
      startDate: '2026-01-01',
      expireDate: '2027-01-01',
      status: 'active'
    });

    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({
      name: 'nc48',
      sshHost: '203.0.113.48',
      sshPort: 2222,
      sshUser: 'root',
      sshCommand: 'ssh root@203.0.113.48 -p 2222',
      probeUrl: 'https://probe.example.com/api/stat',
      probeApiKey: null,
      hasProbeApiKey: true
    });
    const storedProbe = context.db.get<{ probe_api_key: string }>('SELECT probe_api_key FROM vps WHERE id = 1');
    expect(storedProbe?.probe_api_key).toMatch(/^enc:v1:/);
    expect(storedProbe?.probe_api_key).not.toContain('probe-secret');

    const monitor = await agent.get('/api/vps/1/monitor');

    expect(monitor.status).toBe(200);
    expect(requestedUrl).toBe('https://probe.example.com/api/stat');
    expect(requestedAuth).toBe('Bearer probe-secret');
    expect(monitor.body.monitor).toMatchObject({
      status: 'online',
      cpuPercent: 42,
      memoryPercent: 50,
      diskPercent: 20,
      netInBps: 1_000_000,
      netOutBps: 512_000,
      netTotalInBytes: 2_147_483_648,
      netTotalOutBytes: 1_073_741_824,
      load1: 0.4,
      uptimeSeconds: 86_400,
      updatedAt: '2026-05-22T01:00:00.000Z'
    });
    expect(monitor.body.item).toMatchObject({
      monitorStatus: 'online',
      monitorCpuPercent: 42,
      monitorMemoryPercent: 50,
      monitorDiskPercent: 20,
      monitorNetInBps: 1_000_000,
      monitorNetOutBps: 512_000,
      monitorUpdatedAt: '2026-05-22T01:00:00.000Z'
    });

    const list = await agent.get('/api/vps');
    expect(list.body.items[0]).toMatchObject({
      monitorStatus: 'online',
      monitorCpuPercent: 42,
      monitorMemoryPercent: 50,
      monitorDiskPercent: 20,
      probeApiKey: null,
      hasProbeApiKey: true
    });
  });

  test('marks a dstatus node offline when its per-node endpoint returns stat false', async () => {
    const { agent, context } = await setupAgent();
    context.fetch = async () => new Response(JSON.stringify({
      sid: 'offline-node',
      name: 'Offline node',
      stat: false
    }), { status: 200 });

    await agent.post('/api/vps').send({
      name: 'dstatus-node',
      probeUrl: 'https://status.example.com/stats/offline-node/data',
      amountMinorUnits: 0,
      currency: 'CNY',
      billingCycle: 'annual',
      status: 'active'
    });

    const response = await agent.get('/api/vps/1/monitor');

    expect(response.status).toBe(200);
    expect(response.body.monitor).toMatchObject({
      status: 'offline',
      cpuPercent: null,
      memoryPercent: null,
      diskPercent: null
    });
    expect(response.body.item).toMatchObject({ monitorStatus: 'offline' });
  });

  test('does not request a private probe address unless it is allowlisted', async () => {
    const { agent, context } = await setupAgent();
    let requested = false;
    context.fetch = async () => {
      requested = true;
      return new Response('{}');
    };

    await agent.post('/api/vps').send({
      name: 'private-probe',
      probeUrl: 'http://127.0.0.1:9100/api/stat',
      amountMinorUnits: 0,
      currency: 'CNY',
      billingCycle: 'annual',
      status: 'active'
    }).expect(201);

    const response = await agent.get('/api/vps/1/monitor').expect(200);
    expect(response.body.monitor.status).toBe('offline');
    expect(requested).toBe(false);
  });

  test('tests VPS SSH connections with password credentials', async () => {
    const { agent, context } = await setupAgent();
    const sshCalls: Array<Record<string, unknown>> = [];
    (context as typeof context & { sshRunner: (options: any) => Promise<{ stdout: string; stderr: string; code: number | null }> }).sshRunner = async (options) => {
      sshCalls.push(options);
      return { stdout: 'moneypulse-ssh-ok\n', stderr: '', code: 0 };
    };

    await agent.post('/api/vps').send({
      name: 'password-node',
      provider: 'netcup',
      ipAddress: '203.0.113.48',
      sshHost: '203.0.113.48',
      sshPort: 22,
      sshUser: 'root',
      sshAuthType: 'password',
      sshPassword: 'saved-password',
      amountMinorUnits: 8900,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-10',
      status: 'active'
    });

    const response = await agent.post('/api/vps/1/ssh/test').send({
      sshHost: '198.51.100.77',
      sshPort: 2222,
      sshUser: 'admin',
      sshAuthType: 'password',
      sshPassword: 'typed-password'
    });

    expect(response.status).toBe(200);
    expect(sshCalls).toEqual([
      expect.objectContaining({
        host: '198.51.100.77',
        port: 2222,
        username: 'admin',
        authType: 'password',
        password: 'typed-password',
        command: 'printf moneypulse-ssh-ok'
      })
    ]);
    expect(response.body).toMatchObject({
      ok: true,
      testedAt: '2026-05-22T01:00:00.000Z',
      item: {
        sshLastTestStatus: 'success',
        sshLastTestMessage: 'moneypulse-ssh-ok',
        sshLastTestedAt: '2026-05-22T01:00:00.000Z'
      }
    });
  });

  test('pins the SSH host fingerprint after the first successful connection', async () => {
    const { agent, context } = await setupAgent();
    const sshCalls: Array<Record<string, unknown>> = [];
    context.sshRunner = async (options) => {
      sshCalls.push({ ...options });
      return {
        stdout: 'moneypulse-ssh-ok\n',
        stderr: '',
        code: 0,
        hostFingerprint: 'SHA256:server-host-key'
      };
    };

    await agent.post('/api/vps').send({
      name: 'pinned-node',
      ipAddress: '203.0.113.49',
      sshPort: 22,
      sshUser: 'root',
      sshAuthType: 'password',
      sshPassword: 'saved-password',
      amountMinorUnits: 0,
      currency: 'CNY',
      billingCycle: 'annual',
      status: 'active'
    }).expect(201);

    const first = await agent.post('/api/vps/1/ssh/test').send({}).expect(200);
    expect(first.body.item.sshHostFingerprint).toBe('SHA256:server-host-key');

    await agent.post('/api/vps/1/ssh/test').send({}).expect(200);
    expect(sshCalls[0].expectedHostFingerprint).toBeUndefined();
    expect(sshCalls[1].expectedHostFingerprint).toBe('SHA256:server-host-key');

    const moved = await agent.put('/api/vps/1').send({ ipAddress: '203.0.113.50' }).expect(200);
    expect(moved.body.item.sshHostFingerprint).toBeNull();
  });

  test('defaults the VPS SSH host to the IP address', async () => {
    const { agent } = await setupAgent();

    const created = await agent.post('/api/vps').send({
      name: 'ip-host-node',
      provider: 'netcup',
      ipAddress: '203.0.113.88',
      sshPort: 22,
      sshUser: 'root',
      amountMinorUnits: 8900,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-10',
      status: 'active'
    });

    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({
      ipAddress: '203.0.113.88',
      sshHost: '203.0.113.88'
    });

    const updated = await agent.put('/api/vps/1').send({
      ipAddress: '198.51.100.88'
    });

    expect(updated.body.item).toMatchObject({
      ipAddress: '198.51.100.88',
      sshHost: '198.51.100.88'
    });
  });

  test('installs a VPS probe over private-key SSH and saves the probe URL', async () => {
    const { agent, context } = await setupAgent();
    const sshCalls: Array<Record<string, unknown>> = [];
    (context as typeof context & { sshRunner: (options: any) => Promise<{ stdout: string; stderr: string; code: number | null }> }).sshRunner = async (options) => {
      sshCalls.push(options);
      return { stdout: 'moneypulse-probe-installed\n', stderr: '', code: 0 };
    };

    await agent.post('/api/vps').send({
      name: 'key-node',
      provider: 'Hetzner',
      ipAddress: '198.51.100.24',
      sshHost: '198.51.100.24',
      sshPort: 22,
      sshUser: 'debian',
      sshAuthType: 'privateKey',
      sshPrivateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
      sshPrivateKeyPassphrase: 'key-passphrase',
      probePort: 9134,
      probeApiKey: 'probe-token',
      amountMinorUnits: 1200,
      currency: 'EUR',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-10',
      status: 'active'
    });

    const response = await agent.post('/api/vps/1/probe/install').send({ probePort: 9134 });

    expect(response.status).toBe(200);
    expect(sshCalls[0]).toEqual(expect.objectContaining({
      host: '198.51.100.24',
      port: 22,
      username: 'debian',
      authType: 'privateKey',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
      passphrase: 'key-passphrase'
    }));
    expect(String(sshCalls[0].command)).toContain('MONEYPULSE_PROBE_PORT=9134');
    expect(String(sshCalls[0].command)).toContain('MONEYPULSE_PROBE_TOKEN=');
    expect(String(sshCalls[0].command)).toContain('$SUDO systemctl restart moneypulse-probe.service');
    expect(response.body).toMatchObject({
      ok: true,
      probeUrl: 'http://198.51.100.24:9134/api/stat',
      installedAt: '2026-05-22T01:00:00.000Z',
      item: {
        probePort: 9134,
        probeUrl: 'http://198.51.100.24:9134/api/stat',
        probeInstallStatus: 'installed',
        probeInstallMessage: 'moneypulse-probe-installed',
        probeInstalledAt: '2026-05-22T01:00:00.000Z'
      }
    });
  });

  test('generates a VPS probe key when installing without one', async () => {
    const { agent, context } = await setupAgent();
    const sshCalls: Array<Record<string, unknown>> = [];
    (context as typeof context & { sshRunner: (options: any) => Promise<{ stdout: string; stderr: string; code: number | null }> }).sshRunner = async (options) => {
      sshCalls.push(options);
      return { stdout: 'moneypulse-probe-installed\n', stderr: '', code: 0 };
    };

    await agent.post('/api/vps').send({
      name: 'generated-key-node',
      provider: 'netcup',
      ipAddress: '203.0.113.91',
      sshPort: 22,
      sshUser: 'root',
      sshAuthType: 'password',
      sshPassword: 'secret-password',
      probePort: 9100,
      amountMinorUnits: 8900,
      currency: 'CNY',
      billingCycle: 'monthly',
      nextDueDate: '2026-06-10',
      status: 'active'
    });

    const response = await agent.post('/api/vps/1/probe/install').send({ probePort: 9100 });
    const generatedKey = String(sshCalls[0].command).match(/MONEYPULSE_PROBE_TOKEN='([^']+)'/)?.[1];

    expect(response.status).toBe(200);
    expect(generatedKey).toMatch(/^mp_[A-Za-z0-9_-]{32}$/);
    expect(response.body.item).toMatchObject({
      probeUrl: 'http://203.0.113.91:9100/api/stat',
      probeInstallStatus: 'installed',
      probeApiKey: null,
      hasProbeApiKey: true
    });
    expect(String(sshCalls[0].command)).toContain(`MONEYPULSE_PROBE_TOKEN='${generatedKey}'`);
  });

  test('normalizes domain registrar metadata and supports suffix, account, and domain sorting', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/domains').send({
      domainName: 'moneypulse.dev',
      registrar: 'Spaceship',
      registrarAccount: 'infra@example.com',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      registerDate: '2025-02-01',
      expireDate: '2026-07-01',
      status: 'active',
      rarityScore: 82
    });

    await agent.post('/api/domains').send({
      domainName: 'moneypulse.com',
      registrar: 'Cloudflare',
      registrarAccount: 'owner@example.com',
      amountMinorUnits: 990,
      currency: 'USD',
      billingCycle: 'annual',
      registerDate: '2024-01-01',
      expireDate: '2026-06-01',
      status: 'active',
      rarityScore: 94
    });

    const suffixList = await agent.get('/api/domains?domainExtension=dev&sort=rarity&direction=desc');
    expect(suffixList.status).toBe(200);
    expect(suffixList.body.items).toEqual([
      expect.objectContaining({
        domainName: 'moneypulse.dev',
        domainExtension: '.dev',
        registrarAccount: 'infra@example.com',
        registrarUrl: 'https://www.spaceship.com/application/domain-list-application',
        rarityScore: 36
      })
    ]);

    const accountList = await agent.get('/api/domains?registrarAccount=infra');
    expect(accountList.status).toBe(200);
    expect(accountList.body.items.map((item: { domainName: string }) => item.domainName)).toEqual([
      'moneypulse.dev'
    ]);
    expect(accountList.body.meta.registrarAccounts).toEqual(expect.arrayContaining([
      {
        registrar: 'Cloudflare',
        account: 'owner@example.com',
        value: 'Cloudflare::owner@example.com',
        count: 1
      },
      {
        registrar: 'Spaceship',
        account: 'infra@example.com',
        value: 'Spaceship::infra@example.com',
        count: 1
      }
    ]));

    const accountKeyList = await agent.get('/api/domains?registrarAccount=Spaceship%3A%3Ainfra%40example.com');
    expect(accountKeyList.status).toBe(200);
    expect(accountKeyList.body.items.map((item: { domainName: string }) => item.domainName)).toEqual([
      'moneypulse.dev'
    ]);

    const expiringFirst = await agent.get('/api/domains?sort=expireDate&direction=asc');
    expect(expiringFirst.body.items.map((item: { domainName: string }) => item.domainName)).toEqual([
      'moneypulse.com',
      'moneypulse.dev'
    ]);
  });

  test('returns domain data when the exchange-rate provider does not respond', async () => {
    const { agent, context } = await setupAgent();
    context.fetch = ((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })) as typeof fetch;

    await agent.post('/api/domains').send({
      domainName: 'nomoney.dev',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2027-07-01',
      status: 'active'
    });

    const startedAt = Date.now();
    const response = await agent.get('/api/domains?displayCurrency=CNY');

    expect(response.status).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(1500);
    expect(response.body.items[0]).toMatchObject({
      domainName: 'nomoney.dev',
      displayAmountMinorUnits: null,
      displayCurrency: 'CNY'
    });
  }, 3000);

  test('returns next-month and rolling-year domain renewal totals converted into the display currency', async () => {
    const { agent, context } = await setupAgent();
    context.fetch = async () => ({
      ok: true,
      json: async () => [
        { date: '2026-05-22', base: 'CNY', quote: 'USD', rate: 0.15 },
        { date: '2026-05-22', base: 'CNY', quote: 'EUR', rate: 0.13 },
        { date: '2026-05-22', base: 'CNY', quote: 'GBP', rate: 0.11 }
      ]
    } as Response);

    await agent.post('/api/domains').send({
      domainName: 'next-month-usd.com',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2026-06-05',
      status: 'active'
    });

    await agent.post('/api/domains').send({
      domainName: 'later-usd.dev',
      registrar: 'Spaceship',
      registrarAccount: 'infra@example.com',
      amountMinorUnits: 2400,
      currency: 'USD',
      billingCycle: 'biennial',
      expireDate: '2026-07-01',
      status: 'active'
    });

    await agent.post('/api/domains').send({
      domainName: 'next-month-cny.de',
      registrar: 'netcup',
      amountMinorUnits: 800,
      currency: 'CNY',
      billingCycle: 'annual',
      expireDate: '2026-06-20',
      status: 'active'
    });

    await agent.post('/api/domains').send({
      domainName: 'biennial.me',
      registrar: 'Porkbun',
      amountMinorUnits: 2400,
      currency: 'USD',
      billingCycle: 'biennial',
      expireDate: '2027-10-01',
      status: 'active'
    });

    await agent.post('/api/domains').send({
      domainName: 'next-year-cny.org',
      registrar: 'netcup',
      amountMinorUnits: 600,
      currency: 'CNY',
      billingCycle: 'annual',
      expireDate: '2027-03-01',
      status: 'active'
    });

    await agent.post('/api/domains').send({
      domainName: 'archived.com',
      registrar: 'Cloudflare',
      amountMinorUnits: 99900,
      currency: 'USD',
      billingCycle: 'annual',
      expireDate: '2026-06-01',
      status: 'active'
    });
    await agent.delete('/api/domains/6').expect(204);

    const response = await agent.get('/api/domains?limit=1&sort=name');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.meta.renewalTotals).toEqual({
      count: 2,
      windowStart: '2026-06-01',
      windowEnd: '2026-06-30',
      byCurrency: { USD: 1200, CNY: 800 },
      displayCurrency: 'CNY',
      convertedTotal: {
        amountMinorUnits: 8800,
        currency: 'CNY',
        exchangeRateDate: '2026-05-22'
      },
      yearlyTotal: {
        count: 4,
        windowStart: '2026-06-01',
        windowEnd: '2027-05-31',
        byCurrency: { USD: 3600, CNY: 1400 },
        convertedTotal: {
          amountMinorUnits: 25400,
          currency: 'CNY',
          exchangeRateDate: '2026-05-22'
        }
      }
    });

    const currencyFiltered = await agent.get('/api/domains?currency=USD');
    expect(currencyFiltered.body.items.every((item: { currency: string }) => item.currency === 'USD')).toBe(true);
    expect(currencyFiltered.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domainName: 'next-month-usd.com',
        amountMinorUnits: 1200,
        currency: 'USD',
        displayAmountMinorUnits: 8000,
        displayCurrency: 'CNY',
        displayExchangeRateDate: '2026-05-22'
      })
    ]));
    expect(currencyFiltered.body.meta.renewalTotals).toMatchObject({
      count: 2,
      byCurrency: { USD: 1200, CNY: 800 },
      convertedTotal: {
        amountMinorUnits: 8800,
        currency: 'CNY'
      },
      yearlyTotal: {
        count: 4,
        byCurrency: { USD: 3600, CNY: 1400 },
        convertedTotal: {
          amountMinorUnits: 25400,
          currency: 'CNY'
        }
      }
    });

    const filtered = await agent.get('/api/domains?currency=USD&domainExtension=dev');

    expect(filtered.body.meta.renewalTotals).toEqual({
      count: 0,
      windowStart: '2026-06-01',
      windowEnd: '2026-06-30',
      byCurrency: {},
      displayCurrency: 'CNY',
      convertedTotal: {
        amountMinorUnits: 0,
        currency: 'CNY',
        exchangeRateDate: null
      },
      yearlyTotal: {
        count: 1,
        windowStart: '2026-06-01',
        windowEnd: '2027-05-31',
        byCurrency: { USD: 2400 },
        convertedTotal: {
          amountMinorUnits: 16000,
          currency: 'CNY',
          exchangeRateDate: '2026-05-22'
        }
      }
    });
  });

  test('rejects monthly and quarterly billing cycles for domain renewals', async () => {
    const { agent } = await setupAgent();

    const monthly = await agent.post('/api/domains').send({
      domainName: 'monthly-domain.com',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'monthly',
      expireDate: '2026-06-05',
      status: 'active'
    });

    expect(monthly.status).toBe(400);
    expect(monthly.body.error.code).toBe('VALIDATION_ERROR');

    const quarterly = await agent.post('/api/domains').send({
      domainName: 'quarterly-domain.com',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'quarterly',
      expireDate: '2026-06-05',
      status: 'active'
    });

    expect(quarterly.status).toBe(400);
    expect(quarterly.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('composes domains from prefix and suffix and calculates rarity automatically', async () => {
    const { agent } = await setupAgent();

    const created = await agent.post('/api/domains').send({
      domainName: 'mp',
      domainExtension: 'com',
      registrar: 'Cloudfare',
      dnsProvider: 'Cloudflare',
      amountMinorUnits: 990,
      currency: 'USD',
      billingCycle: 'annual',
      registerDate: '2026-01-01',
      expireDate: '2027-01-01',
      status: 'active',
      rarityScore: 1
    });

    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({
      domainName: 'mp.com',
      domainExtension: '.com',
      registrarUrl: 'https://dash.cloudflare.com',
      rarityScore: 89
    });

    const updated = await agent.put('/api/domains/1').send({
      domainName: 'moneypulse',
      domainExtension: '.de'
    });

    expect(updated.body.item).toMatchObject({
      domainName: 'moneypulse.de',
      domainExtension: '.de',
      rarityScore: 43
    });
  });

  test('defaults domain renewal dates from registration date and billing cycle', async () => {
    const { agent } = await setupAgent();

    const created = await agent.post('/api/domains').send({
      domainName: 'cyclelogic',
      domainExtension: '.me',
      registrar: 'Spaceship',
      amountMinorUnits: 2400,
      currency: 'USD',
      billingCycle: 'biennial',
      registerDate: '2026-01-15',
      status: 'active'
    });

    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({
      domainName: 'cyclelogic.me',
      billingCycle: 'biennial',
      registerDate: '2026-01-15',
      lastRenewDate: '2026-01-15',
      expireDate: '2028-01-15',
      nextDueDate: '2028-01-15'
    });

    const updated = await agent.put('/api/domains/1').send({
      billingCycle: 'annual',
      lastRenewDate: '2027-02-28'
    });

    expect(updated.body.item).toMatchObject({
      billingCycle: 'annual',
      lastRenewDate: '2027-02-28',
      expireDate: '2028-02-28',
      nextDueDate: '2028-02-28'
    });

    const cycleChanged = await agent.put('/api/domains/1').send({
      billingCycle: 'biennial'
    });

    expect(cycleChanged.body.item).toMatchObject({
      billingCycle: 'biennial',
      lastRenewDate: '2027-02-28',
      expireDate: '2029-02-28',
      nextDueDate: '2029-02-28'
    });
  });

  test('renews a domain by one billing cycle from the current expiry date', async () => {
    const { agent } = await setupAgent();

    await agent.post('/api/domains').send({
      domainName: 'renew-me.com',
      registrar: 'Cloudflare',
      amountMinorUnits: 1200,
      currency: 'USD',
      billingCycle: 'annual',
      registerDate: '2026-01-31',
      lastRenewDate: '2026-01-31',
      expireDate: '2027-01-31',
      nextDueDate: '2027-01-31',
      status: 'active'
    });

    const renewed = await agent.post('/api/domains/1/renew').expect(200);

    expect(renewed.body.item).toMatchObject({
      lastRenewDate: '2026-05-22',
      expireDate: '2028-01-31',
      nextDueDate: '2028-01-31'
    });
  });

  test('rejects invalid asset list query values', async () => {
    const { agent } = await setupAgent();

    const response = await agent.get('/api/subscriptions?limit=not-a-number&currency=JPY');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
