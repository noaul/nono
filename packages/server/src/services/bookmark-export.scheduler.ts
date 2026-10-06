import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/** Checks every ten minutes whether the configured bookmark export slot has come round. */
export function registerBookmarkExportScheduler(app: FastifyInstance, services: AppServices) {
  const explicit = process.env.BOOKMARK_EXPORT_SCHEDULER_ENABLED;
  if (!(explicit === 'true' || (explicit === undefined && process.env.NODE_ENV === 'production'))) return;

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  const schedule = (delayMs: number) => {
    timer = setTimeout(async () => {
      try {
        await services.bookmarkExportService.runDue();
      } catch (error) {
        app.log.error({ err: error }, 'Scheduled bookmark export failed');
      } finally {
        if (!stopped) schedule(CHECK_INTERVAL_MS);
      }
    }, delayMs);
    timer.unref?.();
  };

  app.addHook('onReady', async () => schedule(90_000));
  app.addHook('onClose', async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  });
}
