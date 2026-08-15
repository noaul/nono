import type { Router } from 'express';
import type { AppContext } from './types.js';
import { assetConfigs, getAssetOrThrow, refreshVpsMonitor } from './assets.js';
import { asyncHandler, HttpError } from './http.js';
import { getSettings } from './settings.js';
import { toIsoDate } from './utils.js';

export type StatusSampleState = 'up' | 'degraded' | 'down';
export type DailyStatusState = 'operational' | 'degraded' | 'outage' | 'no_data';
export type OverallStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'no_data';
export type StatusWindow = '24h' | '7d' | '30d' | '90d';

const statusWindows = new Set<StatusWindow>(['24h', '7d', '30d', '90d']);

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
    res.json(buildStatusOverview(context, parseStatusWindow(req.query.window)));
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
  const timeZone = getSettings(context).timezone;
  const day = toIsoDate(context.now(), timeZone);
  context.db.run(
    'INSERT OR REPLACE INTO vps_status_samples (vps_id, sampled_at, state, latency_ms, detail) VALUES (?, ?, ?, ?, ?)',
    [vpsId, sampledAt, state, latencyMs, detail]
  );
  const samples = context.db.all<{ sampled_at: string; state: StatusSampleState }>(
    'SELECT sampled_at, state FROM vps_status_samples WHERE vps_id = ?',
    [vpsId]
  ).filter((row) => toIsoDate(new Date(row.sampled_at), timeZone) === day).map((row) => row.state);
  const aggregate = aggregateStatusDay({ expectedSamples: expectedSamplesForDay(day, context.now(), timeZone), samples });
  context.db.run(
    `INSERT OR REPLACE INTO vps_status_daily (
       vps_id, day, state, uptime_percent, sample_count, up_count, degraded_count, down_count, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [vpsId, day, aggregate.state, aggregate.uptimePercent, aggregate.sampleCount, aggregate.upCount, aggregate.degradedCount, aggregate.downCount, sampledAt]
  );
}

export function parseStatusWindow(value: unknown): StatusWindow {
  if (value === undefined) return '24h';
  const normalized = String(value);
  if (statusWindows.has(normalized as StatusWindow)) return normalized as StatusWindow;
  throw new HttpError(400, 'INVALID_STATUS_WINDOW', 'Status window must be one of 24h, 7d, 30d, or 90d');
}

export function buildStatusOverview(context: AppContext, requestedWindow: StatusWindow | number = '24h') {
  const window = normalizeStatusWindow(requestedWindow);
  const now = context.now();
  const timeZone = getSettings(context).timezone;
  const hourly = window === '24h';
  const days = hourly ? 1 : Number.parseInt(window, 10);
  const end = hourly ? now.toISOString() : toIsoDate(now, timeZone);
  const periods = hourly ? hourlyPeriods(now) : dailyPeriods(end, days);
  const start = periods[0];
  const vps = context.db.all<Record<string, unknown>>(
    "SELECT id, name, provider, location, probe_url, monitor_status, monitor_updated_at FROM vps WHERE archived_at IS NULL AND status != 'cancelled' ORDER BY name"
  );
  const items = vps.map((row) => {
    if (hourly) return buildHourlyStatusItem(context, row, periods, start, end, now);
    const dailyRows = context.db.all<Record<string, unknown>>(
      'SELECT * FROM vps_status_daily WHERE vps_id = ? AND day >= ? AND day <= ? ORDER BY day',
      [Number(row.id), start, end]
    );
    const byDay = new Map(dailyRows.map((daily) => [String(daily.day), daily]));
    const history = periods.map((day) => {
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
    const currentState = currentStateFor(row, now, context);
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
    range: { start, end, days, window, unit: hourly ? 'hour' : 'day' },
    items,
    domainStats: buildDomainStats(context)
  };
}

function buildHourlyStatusItem(
  context: AppContext,
  row: Record<string, unknown>,
  periods: string[],
  start: string,
  end: string,
  now: Date
) {
  const samples = context.db.all<{ sampled_at: string; state: StatusSampleState }>(
    'SELECT sampled_at, state FROM vps_status_samples WHERE vps_id = ? AND sampled_at >= ? AND sampled_at <= ? ORDER BY sampled_at',
    [Number(row.id), start, end]
  );
  const byHour = new Map<string, StatusSampleState[]>();
  for (const sample of samples) {
    const index = Math.min(23, Math.max(0, Math.floor((Date.parse(sample.sampled_at) - Date.parse(start)) / 60 / 60_000)));
    const period = periods[index];
    byHour.set(period, [...(byHour.get(period) ?? []), sample.state]);
  }
  const history = periods.map((period) => {
    const states = byHour.get(period) ?? [];
    const aggregate = aggregateStatusDay({ expectedSamples: states.length, samples: states });
    return {
      day: period,
      state: aggregate.state,
      uptimePercent: aggregate.uptimePercent,
      sampleCount: aggregate.sampleCount,
      incidents: aggregate.downCount
    };
  });
  const totals = samples.reduce<{ up: number; degraded: number; down: number }>((sum, sample) => ({
    ...sum,
    [sample.state]: sum[sample.state] + 1
  }), { up: 0, degraded: 0, down: 0 });
  const measured = samples.length;
  return {
    id: Number(row.id),
    name: String(row.name),
    provider: row.provider ?? null,
    location: row.location ?? null,
    configured: Boolean(row.probe_url),
    currentState: currentStateFor(row, now, context),
    uptimePercent: measured ? roundPercent(((totals.up + totals.degraded) / measured) * 100) : null,
    history
  };
}

function normalizeStatusWindow(value: StatusWindow | number): StatusWindow {
  if (typeof value !== 'number') return value;
  if (value === 7 || value === 30 || value === 90) return `${value}d` as StatusWindow;
  return '90d';
}

function dailyPeriods(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDays(end, index - days + 1));
}

function hourlyPeriods(now: Date): string[] {
  const start = now.getTime() - 24 * 60 * 60_000;
  return Array.from({ length: 24 }, (_, index) => new Date(start + index * 60 * 60_000).toISOString());
}

function buildDomainStats(context: AppContext) {
  const today = toIsoDate(context.now(), getSettings(context).timezone);
  const cutoff = addDays(today, 30);
  const rows = context.db.all<{
    status: string;
    expire_date: string | null;
    auto_renew: number;
    registrar: string | null;
    domain_extension: string | null;
    domain_name: string;
  }>(
    `SELECT status, expire_date, auto_renew, registrar, domain_extension, domain_name
     FROM domains WHERE archived_at IS NULL AND status != 'cancelled'`
  );
  const registrars = new Set<string>();
  const suffixCounts = new Map<string, number>();
  let active = 0;
  let expiringWithin30Days = 0;
  let autoRenew = 0;
  for (const row of rows) {
    if (row.status === 'active') active += 1;
    if (row.auto_renew) autoRenew += 1;
    if (row.expire_date && row.expire_date >= today && row.expire_date <= cutoff) expiringWithin30Days += 1;
    const registrar = row.registrar?.trim();
    if (registrar) registrars.add(registrar.toLocaleLowerCase());
    const suffix = normalizeDomainSuffix(row.domain_extension, row.domain_name);
    if (suffix) suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1);
  }
  const topSuffix = [...suffixCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  return { total: rows.length, active, expiringWithin30Days, autoRenew, registrars: registrars.size, topSuffix };
}

function normalizeDomainSuffix(value: string | null, domainName: string): string | null {
  const stored = value?.trim().toLocaleLowerCase();
  if (stored) return stored.startsWith('.') ? stored : `.${stored}`;
  const segments = domainName.trim().toLocaleLowerCase().split('.');
  return segments.length > 1 && segments.at(-1) ? `.${segments.at(-1)}` : null;
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
  const dailyCutoff = toIsoDate(new Date(context.now().getTime() - 365 * 86_400_000), getSettings(context).timezone);
  context.db.run('DELETE FROM vps_status_samples WHERE sampled_at < ?', [rawCutoff]);
  context.db.run('DELETE FROM vps_status_daily WHERE day < ?', [dailyCutoff]);
}

function expectedSamplesForDay(day: string, now: Date, timeZone: string): number {
  const today = toIsoDate(now, timeZone);
  if (day < today) return 288;
  if (day > today) return 0;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return Math.max(1, Math.floor((hour * 60 + minute) / 5) + 1);
}

function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function roundPercent(value: number): number { return Math.round(value * 100) / 100; }
