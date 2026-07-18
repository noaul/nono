import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';

interface SchedulerConfig {
  pollIntervalMs: number;
  startDelayMs: number;
}

export function registerBackupAutomationScheduler(app: FastifyInstance, services: AppServices) {
  const config = schedulerConfig(process.env);
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const schedule = (delayMs: number) => {
    timer = setTimeout(async () => {
      try {
        await services.backupAutomationService.runDue();
      } catch (error) {
        app.log.error({ err: error }, 'Scheduled full backup failed');
      } finally {
        if (!stopped) schedule(config.pollIntervalMs);
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
  const pollSeconds = boundedNumber(env.BACKUP_AUTOMATION_POLL_SECONDS, 60, 10, 60 * 60);
  const startDelaySeconds = boundedNumber(env.BACKUP_AUTOMATION_START_DELAY_SECONDS, 60, 0, 60 * 60);
  return {
    pollIntervalMs: pollSeconds * 1000,
    startDelayMs: startDelaySeconds * 1000,
  };
}

function boundedNumber(raw: string | undefined, fallback: number, minimum: number, maximum: number) {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
