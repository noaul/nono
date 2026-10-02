import type { Router } from 'express';
import type { AppContext, DbClient } from './types.js';
import { assetConfigs, getAssetOrThrow, refreshVpsMonitor } from './assets.js';
import { asyncHandler, HttpError } from './http.js';
import { getSettings } from './settings.js';
import { notify } from './notifier.js';
import { toIsoDate } from './utils.js';
import { getDatabaseGeneration } from './db.js';

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

const activeSweeps = new WeakMap<DbClient, Promise<Awaited<ReturnType<typeof performStatusSweep>>>>();

/** Manual refresh and the scheduler share a sweep, including delivery and acknowledgement. */
export function runStatusSweep(context: AppContext) {
  const active = activeSweeps.get(context.db);
  if (active) return active;
  const sweep = performStatusSweep(context).finally(() => activeSweeps.delete(context.db));
  activeSweeps.set(context.db, sweep);
  return sweep;
}

async function performStatusSweep(context: AppContext) {
  const generation = getDatabaseGeneration(context.db);
  const vpsConfig = assetConfigs.find((config) => config.type === 'vps');
  if (!vpsConfig) throw new Error('VPS configuration is missing');
  const rows = context.db.all<Record<string, unknown>>(
    "SELECT id FROM vps WHERE archived_at IS NULL AND status != 'cancelled' AND probe_url IS NOT NULL AND probe_url != '' ORDER BY id"
  );
  const results: Array<{ vpsId: number; state: StatusSampleState }> = [];
  for (let index = 0; index < rows.length; index += 4) {
    const batch = rows.slice(index, index + 4);
    const batchResults = await Promise.all(batch.map(async (row) => {
      const id = Number(row.id);
      const startedAt = Date.now();
      const item = getAssetOrThrow(context, vpsConfig, id, { includeSecrets: true });
      const monitor = await refreshVpsMonitor(context, vpsConfig, id, item);
      if (getDatabaseGeneration(context.db) !== generation) return undefined;
      const previous = context.db.get<{ state: StatusSampleState }>(
        'SELECT state FROM vps_status_samples WHERE vps_id = ? ORDER BY sampled_at DESC LIMIT 1', [id]
      )?.state;
      const state: StatusSampleState = monitor.status === 'online' ? 'up' : previous === 'degraded' || previous === 'down' ? 'down' : 'degraded';
      recordStatusSample(context, id, state, Date.now() - startedAt, monitor.status === 'online' ? null : monitor.error ?? 'Probe unavailable');
      if (monitor.status === 'online') accumulateTraffic(context, id, monitor.netTotalInBytes, monitor.netTotalOutBytes);
      evaluateAlerts(context, id, String(item.name ?? `VPS #${id}`), state, monitor.diskPercent, monitor.error);
      return { vpsId: id, state };
    }));
    // Restore invalidates probes and transitions from the previous database contents.
    if (getDatabaseGeneration(context.db) !== generation) return { checked: 0, results: [], alerts: [] };
    results.push(...batchResults.filter((result) => result !== undefined));
  }
  pruneStatusHistory(context);
  context.db.run(`DELETE FROM pending_status_alerts WHERE vps_id NOT IN (
    SELECT id FROM vps WHERE archived_at IS NULL AND status != 'cancelled'
  )`);
  const pending = context.db.all<{ id: number; vps_id: number; name: string; kind: StatusAlert['kind']; detail: string }>(
    'SELECT * FROM pending_status_alerts ORDER BY id'
  );
  const alerts = pending.map((row) => ({ vpsId: row.vps_id, name: row.name, kind: row.kind, detail: row.detail }));
  const delivered = alerts.length ? await sendAlerts(context, alerts) : [];
  if (getDatabaseGeneration(context.db) === generation && delivered.some((item) => item.ok)) {
    context.db.exec('BEGIN');
    try {
      for (const row of pending) context.db.run('DELETE FROM pending_status_alerts WHERE id = ?', [row.id]);
      context.db.exec('COMMIT');
    } catch (error) { context.db.exec('ROLLBACK'); throw error; }
  }
  return { checked: results.length, results, alerts: alerts.map((alert) => ({ ...alert, delivered: delivered.some((item) => item.ok) })) };
}

/**
 * Keeps a per-billing-period traffic counter. Probes report totals since boot,
 * so each sweep adds the growth since the previous reading (or the whole
 * total after a reboot reset it) and the counter restarts on the reset day.
 */
export function accumulateTraffic(context: AppContext, vpsId: number, totalIn: number | null, totalOut: number | null): void {
  if (totalIn === null && totalOut === null) return;
  const total = Number(totalIn ?? 0) + Number(totalOut ?? 0);
  const row = context.db.get<{ traffic_reset_day: number | null; traffic_used_bytes: number | null; traffic_last_total_bytes: number | null; traffic_period_start: string | null }>(
    'SELECT traffic_reset_day, traffic_used_bytes, traffic_last_total_bytes, traffic_period_start FROM vps WHERE id = ?', [vpsId]
  );
  if (!row) return;
  const periodStart = trafficPeriodStart(toIsoDate(context.now(), getSettings(context).timezone), row.traffic_reset_day ?? 1);
  const last = row.traffic_last_total_bytes;
  const delta = last === null ? 0 : total >= last ? total - last : total;
  const used = row.traffic_period_start === periodStart ? Number(row.traffic_used_bytes ?? 0) + delta : delta;
  context.db.run(
    'UPDATE vps SET traffic_used_bytes = ?, traffic_last_total_bytes = ?, traffic_period_start = ? WHERE id = ?',
    [used, total, periodStart, vpsId]
  );
}

export function trafficPeriodStart(today: string, resetDay: number): string {
  const [year, month, day] = today.split('-').map(Number);
  const start = day >= resetDay ? { year, month } : { year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 };
  return `${start.year}-${String(start.month).padStart(2, '0')}-${String(resetDay).padStart(2, '0')}`;
}

type StatusAlert = { vpsId: number; name: string; kind: 'down' | 'recovered' | 'disk' | 'traffic'; detail: string };

/**
 * Turns one sweep result into alert transitions. Alerts fire once per incident:
 * `down` when a node reaches the down state, `recovered` when it is back up, and
 * `disk` when usage crosses the threshold (re-armed after it drops 5 points below).
 */
export function evaluateAlerts(
  context: AppContext,
  vpsId: number,
  name: string,
  state: StatusSampleState,
  diskPercent: number | null,
  error?: string
): StatusAlert[] {
  // Persist observation transitions and their notifications in the same transaction.
  context.db.exec('BEGIN');
  try {
    const alerts = evaluateAlertTransitions(context, vpsId, name, state, diskPercent, error);
    for (const alert of alerts) context.db.run(
      'INSERT INTO pending_status_alerts (vps_id, name, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)',
      [alert.vpsId, alert.name, alert.kind, alert.detail, context.now().toISOString()]
    );
    context.db.exec('COMMIT');
    return alerts;
  } catch (error) { context.db.exec('ROLLBACK'); throw error; }
}

function evaluateAlertTransitions(context: AppContext, vpsId: number, name: string, state: StatusSampleState, diskPercent: number | null, error?: string): StatusAlert[] {
  const settings = getSettings(context);
  const row = context.db.get<{
    alert_down_since: string | null;
    alert_disk_at: string | null;
    alert_traffic_period: string | null;
    traffic_quota_gb: number | null;
    traffic_used_bytes: number | null;
    traffic_period_start: string | null;
  }>(
    'SELECT alert_down_since, alert_disk_at, alert_traffic_period, traffic_quota_gb, traffic_used_bytes, traffic_period_start FROM vps WHERE id = ?', [vpsId]
  );
  if (!row) return [];
  const now = context.now().toISOString();
  const alerts: StatusAlert[] = [];
  if (state === 'down' && !row.alert_down_since) {
    context.db.run('UPDATE vps SET alert_down_since = ? WHERE id = ?', [now, vpsId]);
    if (settings.outageAlertsEnabled) alerts.push({ vpsId, name, kind: 'down', detail: error ?? 'Probe unavailable' });
  } else if (state === 'up' && row.alert_down_since) {
    context.db.run('UPDATE vps SET alert_down_since = NULL WHERE id = ?', [vpsId]);
    const minutes = Math.max(1, Math.round((Date.parse(now) - Date.parse(row.alert_down_since)) / 60_000));
    if (settings.outageAlertsEnabled) alerts.push({ vpsId, name, kind: 'recovered', detail: `${minutes}` });
  }
  const threshold = settings.diskAlertPercent;
  if (threshold > 0 && diskPercent !== null) {
    if (diskPercent >= threshold && !row.alert_disk_at) {
      context.db.run('UPDATE vps SET alert_disk_at = ? WHERE id = ?', [now, vpsId]);
      alerts.push({ vpsId, name, kind: 'disk', detail: `${Math.round(diskPercent)}` });
    } else if (diskPercent < threshold - 5 && row.alert_disk_at) {
      context.db.run('UPDATE vps SET alert_disk_at = NULL WHERE id = ?', [vpsId]);
    }
  }
  // One warning per billing period once 90% of the traffic quota is used.
  const quotaBytes = Number(row.traffic_quota_gb ?? 0) * 1024 ** 3;
  if (quotaBytes > 0 && row.traffic_period_start && row.alert_traffic_period !== row.traffic_period_start) {
    const ratio = Number(row.traffic_used_bytes ?? 0) / quotaBytes;
    if (ratio >= 0.9) {
      context.db.run('UPDATE vps SET alert_traffic_period = ? WHERE id = ?', [row.traffic_period_start, vpsId]);
      alerts.push({ vpsId, name, kind: 'traffic', detail: `${Math.round(ratio * 100)}` });
    }
  }
  return alerts;
}

async function sendAlerts(context: AppContext, alerts: StatusAlert[]) {
  const en = getSettings(context).language === 'en';
  const lines = alerts.map((alert) => {
    if (alert.kind === 'down') return en ? `DOWN  ${alert.name}: ${alert.detail}` : `宕机  ${alert.name}：${alert.detail}`;
    if (alert.kind === 'recovered') return en ? `UP    ${alert.name}: back after ${alert.detail} min` : `恢复  ${alert.name}：中断约 ${alert.detail} 分钟`;
    if (alert.kind === 'traffic') return en ? `TRAFFIC ${alert.name}: ${alert.detail}% of this period's quota used` : `流量  ${alert.name}：本周期已用 ${alert.detail}%`;
    return en ? `DISK  ${alert.name}: ${alert.detail}% used` : `磁盘  ${alert.name}：已用 ${alert.detail}%`;
  });
  const downCount = alerts.filter((alert) => alert.kind === 'down').length;
  const subject = downCount
    ? (en ? `[Yumi] ${downCount} server(s) down` : `[Yumi] ${downCount} 台服务器宕机`)
    : (en ? '[Yumi] Server status changed' : '[Yumi] 服务器状态变化');
  try {
    return await notify(context, { subject, text: lines.join('\n'), severity: downCount ? 'critical' : 'warning' });
  } catch (error) {
    console.error('Yumi alert delivery failed', error);
    return [];
  }
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
  const items = vps.map((row) => ({ ...buildStatusItem(row), ...latestSample(context, Number(row.id)) }));
  function buildStatusItem(row: Record<string, unknown>) {
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
  }
  return {
    overallStatus: classifyOverallStatus(items.filter((item) => item.configured).map((item) => item.currentState)),
    range: { start, end, days, window, unit: hourly ? 'hour' : 'day' },
    items,
    domainStats: buildDomainStats(context)
  };
}

/** Latest probe latency and failure reason, shown next to the node in the overview. */
function latestSample(context: AppContext, vpsId: number) {
  const row = context.db.get<{ latency_ms: number | null; detail: string | null; state: StatusSampleState; sampled_at: string }>(
    'SELECT latency_ms, detail, state, sampled_at FROM vps_status_samples WHERE vps_id = ? ORDER BY sampled_at DESC LIMIT 1', [vpsId]
  );
  return {
    latencyMs: row?.state === 'up' && row.latency_ms !== null ? Number(row.latency_ms) : null,
    lastError: row && row.state !== 'up' ? row.detail : null,
    lastCheckedAt: row?.sampled_at ?? null
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
