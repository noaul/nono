import type { Router } from 'express';
import type { AppContext } from './types.js';
import { assetConfigs, getAssetOrThrow, refreshVpsMonitor } from './assets.js';
import { asyncHandler } from './http.js';

export type StatusSampleState = 'up' | 'degraded' | 'down';
export type DailyStatusState = 'operational' | 'degraded' | 'outage' | 'no_data';
export type OverallStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'no_data';

export function aggregateStatusDay(input: { expectedSamples: number; samples: StatusSampleState[] }) {
  const upCount = input.samples.filter((state) => state === 'up').length;
  const degradedCount = input.samples.filter((state) => state === 'degraded').length;
  const downCount = input.samples.filter((state) => state === 'down').length;
  const sampleCount = input.samples.length;
  if (!sampleCount) {
    return { state: 'no_data' as const, uptimePercent: null, sampleCount, upCount, degradedCount, downCount };
  }
  const uptimePercent = roundPercent(((upCount + degradedCount) / sampleCount) * 100);
  const state: DailyStatusState = downCount > 0
    ? 'outage'
    : degradedCount > 0 || sampleCount < Math.max(1, Math.floor(input.expectedSamples * 0.8))
      ? 'degraded'
      : 'operational';
  return { state, uptimePercent, sampleCount, upCount, degradedCount, downCount };
}

export function classifyOverallStatus(states: DailyStatusState[]): OverallStatus {
  const relevant = states.filter((state) => state !== 'no_data');
  if (!relevant.length) return 'no_data';
  const outages = relevant.filter((state) => state === 'outage').length;
  if (outages === relevant.length) return 'major_outage';
  if (outages > 0) return 'partial_outage';
  if (relevant.some((state) => state === 'degraded')) return 'degraded';
  return 'operational';
}

export function registerStatusRoutes(router: Router, context: AppContext): void {
  router.get('/status/overview', (req, res) => {
    const requestedDays = Number(req.query.days ?? 90);
    const days = Number.isInteger(requestedDays) ? Math.max(7, Math.min(365, requestedDays)) : 90;
    res.json(buildStatusOverview(context, days));
  });

  router.post('/status/refresh', asyncHandler(async (_req, res) => {
    res.json(await runStatusSweep(context));
  }));
}

export async function runStatusSweep(context: AppContext) {
  const vpsConfig = assetConfigs.find((config) => config.type === 'vps');
  if (!vpsConfig) throw new Error('VPS configuration is missing');
  const rows = context.db.all<Record<string, unknown>>(
    "SELECT id FROM vps WHERE archived_at IS NULL AND status != 'cancelled' AND probe_url IS NOT NULL AND probe_url != '' ORDER BY id"
  );
  const results: Array<{ vpsId: number; state: StatusSampleState }> = [];
  for (let index = 0; index < rows.length; index += 4) {
    const batch = rows.slice(index, index + 4);
    results.push(...await Promise.all(batch.map(async (row) => {
      const id = Number(row.id);
      const startedAt = Date.now();
      const item = getAssetOrThrow(context, vpsConfig, id, { includeSecrets: true });
      const monitor = await refreshVpsMonitor(context, vpsConfig, id, item);
      const previous = context.db.get<{ state: StatusSampleState }>(
        'SELECT state FROM vps_status_samples WHERE vps_id = ? ORDER BY sampled_at DESC LIMIT 1', [id]
      )?.state;
      const state: StatusSampleState = monitor.status === 'online' ? 'up' : previous === 'degraded' || previous === 'down' ? 'down' : 'degraded';
      recordStatusSample(context, id, state, Date.now() - startedAt, monitor.status === 'online' ? null : 'Probe unavailable');
      return { vpsId: id, state };
    })));
  }
  pruneStatusHistory(context);
  return { checked: results.length, results };
}

export function recordStatusSample(
  context: AppContext,
  vpsId: number,
  state: StatusSampleState,
  latencyMs: number | null,
  detail: string | null
): void {
  const sampledAt = context.now().toISOString();
  const day = sampledAt.slice(0, 10);
  context.db.run(
    'INSERT OR REPLACE INTO vps_status_samples (vps_id, sampled_at, state, latency_ms, detail) VALUES (?, ?, ?, ?, ?)',
    [vpsId, sampledAt, state, latencyMs, detail]
  );
  const samples = context.db.all<{ state: StatusSampleState }>(
    'SELECT state FROM vps_status_samples WHERE vps_id = ? AND sampled_at >= ? AND sampled_at < ?',
    [vpsId, `${day}T00:00:00.000Z`, `${addDays(day, 1)}T00:00:00.000Z`]
  ).map((row) => row.state);
  const aggregate = aggregateStatusDay({ expectedSamples: expectedSamplesForDay(day, context.now()), samples });
  context.db.run(
    `INSERT OR REPLACE INTO vps_status_daily (
       vps_id, day, state, uptime_percent, sample_count, up_count, degraded_count, down_count, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [vpsId, day, aggregate.state, aggregate.uptimePercent, aggregate.sampleCount, aggregate.upCount, aggregate.degradedCount, aggregate.downCount, sampledAt]
  );
}

export function buildStatusOverview(context: AppContext, days: number) {
  const end = context.now().toISOString().slice(0, 10);
  const dates = Array.from({ length: days }, (_, index) => addDays(end, index - days + 1));
  const start = dates[0];
  const vps = context.db.all<Record<string, unknown>>(
    "SELECT id, name, provider, location, probe_url, monitor_status, monitor_updated_at FROM vps WHERE archived_at IS NULL AND status != 'cancelled' ORDER BY name"
  );
  const items = vps.map((row) => {
    const dailyRows = context.db.all<Record<string, unknown>>(
      'SELECT * FROM vps_status_daily WHERE vps_id = ? AND day >= ? AND day <= ? ORDER BY day',
      [Number(row.id), start, end]
    );
    const byDay = new Map(dailyRows.map((daily) => [String(daily.day), daily]));
    const history = dates.map((day) => {
      const daily = byDay.get(day);
      return daily ? {
        day,
        state: daily.state,
        uptimePercent: daily.uptime_percent === null ? null : Number(daily.uptime_percent),
        sampleCount: Number(daily.sample_count),
        incidents: Number(daily.down_count)
      } : { day, state: 'no_data', uptimePercent: null, sampleCount: 0, incidents: 0 };
    });
    const totals = dailyRows.reduce<{ up: number; degraded: number; down: number }>((sum, daily) => ({
      up: sum.up + Number(daily.up_count),
      degraded: sum.degraded + Number(daily.degraded_count),
      down: sum.down + Number(daily.down_count)
    }), { up: 0, degraded: 0, down: 0 });
    const measured = totals.up + totals.degraded + totals.down;
    const currentState = currentStateFor(row, context.now(), context);
    return {
      id: Number(row.id),
      name: String(row.name),
      provider: row.provider ?? null,
      location: row.location ?? null,
      configured: Boolean(row.probe_url),
      currentState,
      uptimePercent: measured ? roundPercent(((totals.up + totals.degraded) / measured) * 100) : null,
      history
    };
  });
  return {
    overallStatus: classifyOverallStatus(items.filter((item) => item.configured).map((item) => item.currentState)),
    range: { start, end, days },
    items
  };
}

function currentStateFor(row: Record<string, unknown>, now: Date, context: AppContext): DailyStatusState {
  if (!row.probe_url) return 'no_data';
  const vpsId = Number(row.id);
  const sample = context.db.get<{ state: StatusSampleState }>(
    'SELECT state FROM vps_status_samples WHERE vps_id = ? ORDER BY sampled_at DESC LIMIT 1', [vpsId]
  );
  if (!sample) return 'no_data';
  const updatedAt = typeof row.monitor_updated_at === 'string' ? Date.parse(row.monitor_updated_at) : NaN;
  if (!Number.isFinite(updatedAt) || now.getTime() - updatedAt > 15 * 60_000) return 'outage';
  if (row.monitor_status === 'online') return 'operational';
  if (sample.state === 'degraded') return 'degraded';
  return 'outage';
}

function pruneStatusHistory(context: AppContext): void {
  const rawCutoff = new Date(context.now().getTime() - 7 * 86_400_000).toISOString();
  const dailyCutoff = new Date(context.now().getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  context.db.run('DELETE FROM vps_status_samples WHERE sampled_at < ?', [rawCutoff]);
  context.db.run('DELETE FROM vps_status_daily WHERE day < ?', [dailyCutoff]);
}

function expectedSamplesForDay(day: string, now: Date): number {
  const today = now.toISOString().slice(0, 10);
  if (day < today) return 288;
  if (day > today) return 0;
  return Math.max(1, Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes()) / 5) + 1);
}

function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function roundPercent(value: number): number { return Math.round(value * 100) / 100; }
