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
        await runScheduledLinkHealthCheck(services, config.intervalMs, new Date(), (userId, error) => {
          app.log.error({ err: error, userId }, 'Scheduled link health check failed for a user');
        });
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

export async function runScheduledLinkHealthCheck(
  services: AppServices,
  intervalMs: number,
  now = new Date(),
  onUserError: (userId: number, error: unknown) => void = () => undefined,
) {
  const staleBefore = new Date(now.getTime() - intervalMs);
  const users = await services.repo.listUsers();
  let checked = 0;
  let failed = 0;

  // One account's failure must not cost every later account its run until the next interval.
  for (const user of users) {
    try {
      checked += await checkUserLinks(services, user, staleBefore);
    } catch (error) {
      failed += 1;
      onUserError(user.id, error);
    }
  }

  return { checked, failed };
}

async function checkUserLinks(services: AppServices, user: { id: number; role: string }, staleBefore: Date) {
  const links = await services.repo.listLinks(user.id);
  const due = links.filter((link) => (
    link.healthCheckEnabled !== false
    && !shouldSkipLinkHealthCheck(link.url)
    && (!link.healthCheckedAt || link.healthCheckedAt <= staleBefore)
  ));
  if (!due.length) return 0;
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
  return result.results.length;
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
