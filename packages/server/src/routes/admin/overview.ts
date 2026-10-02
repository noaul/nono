import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAdminSession } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';

type Block<T> = { state: 'ok'; data: T } | { state: 'unavailable'; error: string };

const BROKEN_LINK_STATES = new Set(['broken', 'timeout', 'invalid']);

async function block<T>(load: () => Promise<T>): Promise<Block<T>> {
  try {
    return { state: 'ok', data: await load() };
  } catch (error) {
    return { state: 'unavailable', error: error instanceof Error ? error.message : 'Unavailable' };
  }
}

/**
 * The NoDesk "today" panel: one request that gathers what needs attention across every product.
 * Each block fails on its own, so a stopped Yumi never blanks the rest of the panel.
 */
export async function overviewRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/overview', async (request, reply) => {
    const user = await requireAdminSession(request, reply, services);
    if (!user) return;
    const [notifications, links, nostar, backup, nomoney, yumi] = await Promise.all([
      block(async () => {
        const feed = await services.notificationService.list(user, { limit: 1 });
        return { unread: feed.unreadCount, urgent: feed.urgentUnreadCount };
      }),
      block(async () => {
        const all = await services.repo.listLinks(user.id);
        const broken = all.filter((link) => link.healthCheckEnabled !== false && BROKEN_LINK_STATES.has(String(link.healthStatus)));
        return { total: all.length, broken: broken.length, examples: broken.slice(0, 3).map((link) => ({ id: link.id, name: link.name, url: link.url })) };
      }),
      block(async () => ({
        unreadReleases: await services.prisma.noStarRelease.count({ where: { userId: user.id, isRead: false } }),
      })),
      block(async () => {
        const automation = await services.backupAutomationService.get();
        return { enabled: automation.settings.enabled, ...automation.status };
      }),
      block(() => services.productOverviewReader('nomoney')),
      block(() => services.productOverviewReader('yumi')),
    ]);
    return sendOk(reply, { generatedAt: new Date().toISOString(), notifications, links, nostar, backup, nomoney, yumi });
  });
}
