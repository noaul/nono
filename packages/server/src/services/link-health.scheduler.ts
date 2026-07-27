import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';
import { checkLinksHealth, shouldSkipLinkHealthCheck } from './link-health.service.js';

interface SchedulerConfig {
  enabled: boolean;
  intervalMs: number;
  startDelayMs: number;
}

export function registerLinkHealthScheduler(app: FastifyInstance, services: AppServices) {
  const config = schedulerConfig(process.env);
  if (!config.enabled) return;

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const schedule = (delayMs: number) => {
    timer = setTimeout(async () => {
      try {
        await runScheduledLinkHealthCheck(services, config.intervalMs);
      } catch (error) {
        app.log.error({ err: error }, 'Scheduled link health check failed');
      } finally {
        if (!stopped) schedule(config.intervalMs);
      }
    }, delayMs);
    timer.unref?.();
  };

  app.addHook('onReady', async () => schedule(config.startDelayMs));
  app.addHook('onClose', async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  });
}

export async function runScheduledLinkHealthCheck(services: AppServices, intervalMs: number, now = new Date()) {
  const staleBefore = new Date(now.getTime() - intervalMs);
  const users = await services.repo.listUsers();
  let checked = 0;

  for (const user of users) {
    const links = await services.repo.listLinks(user.id);
    const due = links.filter((link) => (
      link.healthCheckEnabled !== false
      && !shouldSkipLinkHealthCheck(link.url)
      && (!link.healthCheckedAt || link.healthCheckedAt <= staleBefore)
    ));
    if (!due.length) continue;
    const result = await checkLinksHealth(due, services.safeRequester, {
      allowPrivateHosts: user.role === 'admin' ? services.privateOutboundHosts : [],
      concurrency: 4,
    });
    await services.repo.updateLinkHealth(user.id, result.results.map((item) => ({
      id: item.id,
      url: item.url,
      status: item.status,
      statusCode: item.statusCode,
      reason: item.reason,
      finalUrl: item.finalUrl,
      checkedAt: new Date(item.checkedAt),
    })));
    checked += result.results.length;
  }

  return { checked };
}

function schedulerConfig(env: NodeJS.ProcessEnv): SchedulerConfig {
  const explicitlyEnabled = env.LINK_HEALTH_CHECK_ENABLED;
  const enabled = explicitlyEnabled === 'true' || (explicitlyEnabled === undefined && env.NODE_ENV === 'production');
  const intervalHours = boundedNumber(env.LINK_HEALTH_CHECK_INTERVAL_HOURS, 24, 1, 24 * 30);
  const startDelaySeconds = boundedNumber(env.LINK_HEALTH_CHECK_START_DELAY_SECONDS, 60, 0, 60 * 60);
  return {
    enabled,
    intervalMs: intervalHours * 60 * 60 * 1000,
    startDelayMs: startDelaySeconds * 1000,
  };
}

function boundedNumber(raw: string | undefined, fallback: number, minimum: number, maximum: number) {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
