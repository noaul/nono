import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';

interface SchedulerConfig {
  enabled: boolean;
  intervalMs: number;
  startDelayMs: number;
}

/** Pushes new notifications to every user's channels on a fixed interval. */
export function registerNotificationDispatchScheduler(app: FastifyInstance, services: AppServices) {
  const config = schedulerConfig(process.env);
  if (!config.enabled) return;

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const schedule = (delayMs: number) => {
    timer = setTimeout(async () => {
      try {
        await services.notificationDispatcher.importLegacyChannels();
        await services.notificationDispatcher.runDue();
        await services.notificationDispatcher.runLinkDigests();
      } catch (error) {
        app.log.error({ err: error }, 'Scheduled notification dispatch failed');
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

function schedulerConfig(env: NodeJS.ProcessEnv): SchedulerConfig {
  const explicitlyEnabled = env.NOTIFICATION_DISPATCH_ENABLED;
  const enabled = explicitlyEnabled === 'true' || (explicitlyEnabled === undefined && env.NODE_ENV === 'production');
  const intervalSeconds = boundedNumber(env.NOTIFICATION_DISPATCH_INTERVAL_SECONDS, 300, 60, 24 * 60 * 60);
  const startDelaySeconds = boundedNumber(env.NOTIFICATION_DISPATCH_START_DELAY_SECONDS, 60, 0, 60 * 60);
  return { enabled, intervalMs: intervalSeconds * 1000, startDelayMs: startDelaySeconds * 1000 };
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
