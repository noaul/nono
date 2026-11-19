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
    // A partial update must not reset fields the client did not send to their schema defaults.
    expect(updated.body.item.tags).toEqual(['ai', 'work']);

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

    const response = await agent.post('/api/subscriptions').send({
      name: 'Canada Plan',
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
      expect.objectContaining({ label: 'Canada Plan', currency: 'CAD' })
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
    expect(updated.body.item).toMatchObject({ licenseKey: null, deviceLimit: 5, purchaseType: 'buyout' });
    expect(updated.body.item).not.toHaveProperty('hasLicenseKey');
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
    expect(response.body.meta).toMatchObject({ total: 1, limit: 1, offset: 0 });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        name: 'Beta',
        currency: 'USD',
        billingCycle: 'annual',
        amountMinorUnits: 6000
      })
    ]);
  });

  test('calculates asset summaries across the full filtered result instead of the current page', async () => {
    const { agent } = await setupAgent();
    const base = {
      provider: 'Vendor',
      account: 'owner@example.com',
      category: 'AI',
      currency: 'USD',
      billingCycle: 'monthly',
      status: 'active'
    };

    await agent.post('/api/subscriptions').send({
      ...base,
      name: 'First',
      amountMinorUnits: 2000,
      nextDueDate: '2026-06-01'
    }).expect(201);
    await agent.post('/api/subscriptions').send({
      ...base,
      name: 'Second',
      amountMinorUnits: 6000,
      nextDueDate: '2026-05-28'
    }).expect(201);

    const response = await agent.get('/api/subscriptions?status=active&limit=1&offset=0');

    expect(response.body.items).toHaveLength(1);
    expect(response.body.meta.total).toBe(2);
    expect(response.body.meta.assetSummary).toMatchObject({
      totalsByCurrency: { USD: 8000 },
      dueWithin30Days: 2,
      statusCounts: { active: 2 }
    });
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

    const renewed = await agent.post('/api/domains/1/renew')
      .send({ requestId: 'renew-me-2027', expectedDueDate: '2027-01-31' })
      .expect(200);

    expect(renewed.body.item).toMatchObject({
      lastRenewDate: '2026-05-22',
      expireDate: '2028-01-31',
      nextDueDate: '2028-01-31'
    });
    expect(renewed.body.renewal).toMatchObject({ amountMinorUnits: 1200, currency: 'USD' });

    const undone = await agent.post(`/api/domains/1/renewals/${renewed.body.renewal.id}/undo`).expect(200);
    expect(undone.body.item).toMatchObject({
      lastRenewDate: '2026-01-31',
      expireDate: '2027-01-31',
      nextDueDate: '2027-01-31'
    });
  });

  test('rejects invalid asset list query values', async () => {
    const { agent } = await setupAgent();

    const response = await agent.get('/api/subscriptions?limit=not-a-number&currency=XYZ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('list filters', () => {
  test('filters by tag and category, searches notes, and reports tag options', async () => {
    const { agent } = await setupAgent();
    const base = { purchaseType: 'subscription', amountMinorUnits: 100, currency: 'CNY', billingCycle: 'monthly', status: 'active' };
    await agent.post('/api/subscriptions').send({ ...base, name: 'A', tags: ['work', 'ai'], category: 'AI', notes: 'team seat' }).expect(201);
    await agent.post('/api/subscriptions').send({ ...base, name: 'B', tags: ['home'], category: 'Streaming' }).expect(201);
    await agent.post('/api/subscriptions').send({ ...base, name: 'C', tags: ['work'] }).expect(201);

    const byTag = await agent.get('/api/subscriptions?tag=work').expect(200);
    expect(byTag.body.items.map((item: { name: string }) => item.name).sort()).toEqual(['A', 'C']);
    expect(byTag.body.meta.tagOptions).toEqual([
      { tag: 'work', count: 2 }, { tag: 'ai', count: 1 }, { tag: 'home', count: 1 }
    ]);
    expect(byTag.body.meta.categoryOptions).toEqual(['AI', 'Streaming']);

    const byCategory = await agent.get('/api/subscriptions?category=streaming').expect(200);
    expect(byCategory.body.items.map((item: { name: string }) => item.name)).toEqual(['B']);

    const byNotes = await agent.get('/api/subscriptions?q=team').expect(200);
    expect(byNotes.body.items.map((item: { name: string }) => item.name)).toEqual(['A']);
  });
});
