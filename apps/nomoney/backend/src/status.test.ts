import { describe, expect, test } from 'vitest';
import { aggregateStatusDay, buildStatusOverview, classifyOverallStatus, recordStatusSample } from './status.js';
import { createTestContext } from './test-utils.js';

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
});
