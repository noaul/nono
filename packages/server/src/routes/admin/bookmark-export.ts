import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { isBearerRequest, requireAdmin } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { setAuditContext } from '../../plugins/audit.js';

const settingsSchema = z.object({
  enabled: z.boolean(),
  cadence: z.enum(['daily', 'weekly']),
  hour: z.number().int().min(0).max(23),
  weekday: z.number().int().min(0).max(6),
  keep: z.number().int().min(1).max(365),
});

/** Scheduled HTML export of the administrator's bookmarks to the backup center's WebDAV. */
export async function bookmarkExportRoutes(app: FastifyInstance, services: AppServices) {
  // Uses the stored WebDAV credentials, so like the backup center it needs an administrator session.
  async function admin(request: Parameters<typeof requireAdmin>[0], reply: Parameters<typeof requireAdmin>[1]) {
    const user = await requireAdmin(request, reply, services);
    if (!user) return null;
    if (isBearerRequest(request)) {
      reply.status(403).send({ code: 403, data: null, message: 'Bookmark export settings require an administrator session' });
      return null;
    }
    return user;
  }

  app.get('/api/admin/bookmark-export', async (request, reply) => {
    if (!await admin(request, reply)) return;
    return sendOk(reply, await services.bookmarkExportService.get());
  });

  app.put('/api/admin/bookmark-export', async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    const settings = settingsSchema.parse(request.body);
    const snapshot = await services.bookmarkExportService.update(user.id, settings);
    setAuditContext(request, { action: 'update', resourceType: 'bookmark_export', resourceLabel: 'WebDAV', details: { after: snapshot.settings } });
    return sendOk(reply, snapshot);
  });

  app.post('/api/admin/bookmark-export/run', async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    const snapshot = await services.bookmarkExportService.runNow(user.id);
    setAuditContext(request, { action: 'create', resourceType: 'bookmark_export', resourceLabel: snapshot.status.lastFile || 'WebDAV' });
    return sendOk(reply, snapshot);
  });
}
