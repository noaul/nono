import { describe, expect, test } from 'vitest';
import { aggregateStatusDay, buildStatusOverview, classifyOverallStatus, recordStatusSample, runStatusSweep, accumulateTraffic, trafficPeriodStart } from './status.js';
import { createTestContext, setupAgent } from './test-utils.js';

describe('Yumi availability history', () => {
  test('aggregates successful, degraded, failed, and missing samples without treating gaps as outages', () => {
    expect(aggregateStatusDay({ expectedSamples: 4, samples: ['up', 'up', 'up', 'up'] })).toMatchObject({
      state: 'operational', uptimePercent: 100, sampleCount: 4
    });
    expect(aggregateStatusDay({ expectedSamples: 4, samples: ['up', 'up', 'degraded', 'up'] })).toMatchObject({
      state: 'degraded', uptimePercent: 100, sampleCount: 4
    });
    expect(aggregateStatusDay({ expectedSamples: 4, samples: ['up', 'down', 'up', 'down'] })).toMatchObject({
      state: 'outage', uptimePercent: 50, sampleCount: 4
    });
    expect(aggregateStatusDay({ expectedSamples: 4, samples: [] })).toMatchObject({
      state: 'no_data', uptimePercent: null, sampleCount: 0
    });
  });

  test('derives the overall banner from configured VPS states', () => {
    expect(classifyOverallStatus([])).toBe('no_data');
    expect(classifyOverallStatus(['operational', 'operational'])).toBe('operational');
    expect(classifyOverallStatus(['operational', 'degraded'])).toBe('degraded');
    expect(classifyOverallStatus(['operational', 'outage'])).toBe('partial_outage');
    expect(classifyOverallStatus(['outage', 'outage'])).toBe('major_outage');
  });

  test('keeps the first failed probe degraded in the current overview', async () => {
    const context = await createTestContext();
    context.product = 'yumi';
    context.now = () => new Date('2026-08-11T12:00:00.000Z');
    context.db.run("INSERT INTO vps (id, name, probe_url, monitor_status, monitor_updated_at, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (1, 'nc48', 'http://example.test', 'offline', '2026-08-11T12:00:00.000Z', 0, 'USD', 'monthly', 'active', '[]', '2026-08-11', '2026-08-11')");
    recordStatusSample(context, 1, 'degraded', 120, 'Probe unavailable');

    expect(buildStatusOverview(context, 7).items[0].currentState).toBe('degraded');
  });

  test('shows a configured VPS with no samples as no data instead of an outage', async () => {
    const context = await createTestContext('yumi');
    context.now = () => new Date('2026-08-11T12:00:00.000Z');
    context.db.run("INSERT INTO vps (id, name, probe_url, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (1, 'new-vps', 'http://example.test', 0, 'USD', 'monthly', 'active', '[]', '2026-08-11', '2026-08-11')");

    const overview = buildStatusOverview(context, 7);

    expect(overview.items[0].currentState).toBe('no_data');
    expect(overview.overallStatus).toBe('no_data');
  });

  test('builds the default 24 hour window from raw samples instead of daily rollups', async () => {
    const context = await createTestContext('yumi');
    context.now = () => new Date('2026-08-11T12:30:00.000Z');
    context.db.run("INSERT INTO vps (id, name, probe_url, monitor_status, monitor_updated_at, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (1, 'nc48', 'http://example.test', 'online', '2026-08-11T12:25:00.000Z', 0, 'USD', 'monthly', 'active', '[]', '2026-08-11', '2026-08-11')");
    context.db.run("INSERT INTO vps_status_samples (vps_id, sampled_at, state, latency_ms, detail) VALUES (1, '2026-08-11T11:05:00.000Z', 'up', 12, NULL)");
    context.db.run("INSERT INTO vps_status_samples (vps_id, sampled_at, state, latency_ms, detail) VALUES (1, '2026-08-11T12:05:00.000Z', 'down', NULL, 'Probe unavailable')");

    const overview = buildStatusOverview(context, '24h');

    expect(overview.range).toMatchObject({ window: '24h' });
    expect(overview.items[0].history).toHaveLength(24);
    expect(overview.items[0].history.slice(-2).map((period) => period.state)).toEqual(['operational', 'outage']);
    expect(overview.items[0].uptimePercent).toBe(50);
  });

  test('includes non-financial domain statistics in the Yumi overview', async () => {
    const context = await createTestContext('yumi');
    context.now = () => new Date('2026-08-11T12:00:00.000Z');
    context.db.run("INSERT INTO domains (id, domain_name, registrar, domain_extension, expire_date, auto_renew, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (1, 'alpha.com', 'Cloudflare', '.com', '2026-08-20', 1, 1000, 'USD', 'annual', 'active', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO domains (id, domain_name, registrar, domain_extension, expire_date, auto_renew, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (2, 'beta.ca', 'Porkbun', '.ca', '2027-01-01', 0, 2000, 'CAD', 'annual', 'paused', '[]', '2026-01-01', '2026-01-01')");
    context.db.run("INSERT INTO domains (id, domain_name, registrar, domain_extension, expire_date, auto_renew, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at, archived_at) VALUES (3, 'deleted.net', 'Cloudflare', '.net', '2026-08-15', 1, 3000, 'USD', 'annual', 'active', '[]', '2026-01-01', '2026-01-01', '2026-08-01')");

    const overview = buildStatusOverview(context, 90);

    expect(overview.domainStats).toEqual({
      total: 2,
      active: 1,
      expiringWithin30Days: 1,
      autoRenew: 1,
      registrars: 2,
      topSuffix: '.ca'
    });
    expect(JSON.stringify(overview.domainStats)).not.toMatch(/amount|currency|cost|fee/i);
  });

  test('groups Yumi daily status by the Shanghai calendar day', async () => {
    const context = await createTestContext('yumi');
    context.now = () => new Date('2026-08-14T16:30:00.000Z');
    context.db.run("INSERT INTO vps (id, name, probe_url, monitor_status, monitor_updated_at, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (1, 'midnight-vps', 'http://example.test', 'online', '2026-08-14T16:30:00.000Z', 0, 'USD', 'monthly', 'active', '[]', '2026-08-15', '2026-08-15')");

    recordStatusSample(context, 1, 'up', 12, null);
    const overview = buildStatusOverview(context, 7);

    expect(context.db.get<{ day: string }>('SELECT day FROM vps_status_daily WHERE vps_id = 1')?.day).toBe('2026-08-15');
    expect(overview.range.end).toBe('2026-08-15');
  });
});

describe('Yumi outage alerts', () => {
  test('alerts once when a node goes down, once when it recovers, and on high disk usage', async () => {
    const context = await createTestContext('yumi');
    context.db.run("INSERT INTO settings (key, value) VALUES ('smtpTo', '\"ops@example.com\"') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    context.db.run("INSERT INTO vps (id, name, probe_url, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (1, 'nc48', 'https://probe.example.com/stats', 0, 'USD', 'monthly', 'active', '[]', '2026-08-11', '2026-08-11')");
    let online = false;
    let disk = 40;
    context.fetch = async () => online
      ? new Response(JSON.stringify({ cpu: { percent: 5 }, mem: { percent: 20 }, disk: { percent: disk } }), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('nope', { status: 502 });

    await runStatusSweep(context);
    expect(context.notifier.sent).toHaveLength(0);

    const down = await runStatusSweep(context);
    expect(down.alerts).toEqual([expect.objectContaining({ kind: 'down', detail: 'Probe returned HTTP 502', delivered: true })]);
    expect(context.notifier.sent.at(-1)?.subject).toContain('1 台服务器宕机');

    await runStatusSweep(context);
    expect(context.notifier.sent).toHaveLength(1);

    online = true;
    disk = 95;
    const recovered = await runStatusSweep(context);
    expect(recovered.alerts.map((alert) => alert.kind).sort()).toEqual(['disk', 'recovered']);
    expect(context.notifier.sent).toHaveLength(2);

    await runStatusSweep(context);
    expect(context.notifier.sent).toHaveLength(2);
  });
});

describe('domain checks', () => {
  test('moves the expiry forward from RDAP, records certificates, and lists certificate expiry as due', async () => {
    const { agent, context } = await setupAgent('yumi');
    await agent.post('/api/domains').send({
      domainName: 'example.com', registrar: 'Cloudflare', amountMinorUnits: 1000, currency: 'USD',
      billingCycle: 'annual', expireDate: '2026-06-01', status: 'active'
    }).expect(201);
    context.fetch = async (input) => {
      expect(String(input)).toBe('https://rdap.org/domain/example.com');
      return new Response(JSON.stringify({ events: [{ eventAction: 'expiration', eventDate: '2027-06-01T04:00:00Z' }] }), { status: 200 });
    };
    context.certificateProbe = async () => ({ validTo: 'Jun  5 12:00:00 2026 GMT', issuer: "Let's Encrypt" });

    const response = await agent.post('/api/domains/1/check').expect(200);

    expect(response.body.rdap).toMatchObject({ ok: true, updated: true, registryExpireDate: '2027-06-01', previousExpireDate: '2026-06-01' });
    expect(response.body.item).toMatchObject({ expireDate: '2027-06-01', sslExpiresAt: '2026-06-05', sslIssuer: "Let's Encrypt" });

    const due = await agent.get('/api/dashboard/expiring?days=30').expect(200);
    expect(due.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'certificate', assetId: 1 })]));
    const scan = await agent.put('/api/settings').send({ reminderDays: [30], smtpTo: 'ops@example.com' }).expect(200);
    expect(scan.body.settings.reminderDays).toEqual([30]);
    const reminders = await agent.post('/api/reminders/run-now').expect(200);
    expect(reminders.body.items).toEqual([expect.objectContaining({ kind: 'certificate', dueDate: '2026-06-05' })]);
  });

  test('never moves a local expiry backwards and records lookup errors', async () => {
    const { agent, context } = await setupAgent('yumi');
    await agent.post('/api/domains').send({
      domainName: 'ahead.dev', registrar: 'Cloudflare', amountMinorUnits: 1000, currency: 'USD',
      billingCycle: 'annual', expireDate: '2028-01-01', status: 'active'
    }).expect(201);
    context.fetch = async () => new Response(JSON.stringify({ events: [{ eventAction: 'expiration', eventDate: '2027-01-01T00:00:00Z' }] }), { status: 200 });
    context.certificateProbe = async () => { throw new Error('connect ECONNREFUSED'); };

    const response = await agent.post('/api/domains/1/check').expect(200);

    expect(response.body.rdap).toMatchObject({ ok: true, updated: false });
    expect(response.body.item).toMatchObject({ expireDate: '2028-01-01', rdapExpireDate: '2027-01-01', sslError: 'connect ECONNREFUSED' });
  });
});

describe('VPS traffic accounting', () => {
  test('accumulates across reboots and restarts on the reset day', async () => {
    const context = await createTestContext('yumi');
    context.db.run("INSERT INTO vps (id, name, amount_minor_units, currency, billing_cycle, status, tags, traffic_reset_day, created_at, updated_at) VALUES (1, 'n', 0, 'USD', 'monthly', 'active', '[]', 15, '2026-05-01', '2026-05-01')");
    const used = () => context.db.get<{ traffic_used_bytes: number; traffic_period_start: string }>('SELECT traffic_used_bytes, traffic_period_start FROM vps WHERE id = 1');

    accumulateTraffic(context, 1, 1000, 0);
    accumulateTraffic(context, 1, 1500, 500);
    accumulateTraffic(context, 1, 100, 0);
    expect(used()).toEqual({ traffic_used_bytes: 1100, traffic_period_start: '2026-05-15' });

    context.now = () => new Date('2026-06-16T01:00:00.000Z');
    accumulateTraffic(context, 1, 400, 0);
    expect(used()).toEqual({ traffic_used_bytes: 300, traffic_period_start: '2026-06-15' });
    expect(trafficPeriodStart('2026-01-03', 15)).toBe('2025-12-15');
  });
});
