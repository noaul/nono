import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';
import type { Repository } from './repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrashRetentionConfig {
  enabled: boolean;
  retentionDays: number;
  intervalMs: number;
  startDelayMs: number;
}

export function registerTrashRetentionScheduler(app: FastifyInstance, services: AppServices) {
  const config = trashRetentionConfig(process.env);
  if (!config.enabled) return;

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const schedule = (delayMs: number) => {
    timer = setTimeout(async () => {
      try {
        const { purged } = await runTrashRetentionPurge(services.repo, config.retentionDays);
        if (purged) app.log.info({ purged, retentionDays: config.retentionDays }, 'Purged expired trash items');
      } catch (error) {
        app.log.error({ err: error }, 'Scheduled trash purge failed');
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

export async function runTrashRetentionPurge(repo: Repository, retentionDays: number, now = new Date()) {
  return { purged: await repo.purgeTrashBefore(new Date(now.getTime() - retentionDays * DAY_MS)) };
}

export function trashRetentionConfig(env: NodeJS.ProcessEnv): TrashRetentionConfig {
  const explicitlyEnabled = env.TRASH_PURGE_ENABLED;
  const enabled = explicitlyEnabled === 'true' || (explicitlyEnabled === undefined && env.NODE_ENV === 'production');
  return {
    enabled,
    retentionDays: boundedNumber(env.TRASH_RETENTION_DAYS, 30, 1, 3650),
    intervalMs: boundedNumber(env.TRASH_PURGE_INTERVAL_HOURS, 6, 1, 24 * 7) * 60 * 60 * 1000,
    startDelayMs: boundedNumber(env.TRASH_PURGE_START_DELAY_SECONDS, 60, 0, 60 * 60) * 1000,
  };
}

function boundedNumber(raw: string | undefined, fallback: number, minimum: number, maximum: number) {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
