import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import type { AppServices } from '../../types.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const readBodySchema = z.object({
  read: z.boolean(),
});

export async function notificationRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/notifications', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const query = listQuerySchema.parse(request.query);
    return sendOk(reply, await services.notificationService.list(user, { limit: query.limit }));
  });

  app.post('/api/admin/notifications/mark-all-read', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const updated = await services.notificationService.markAllRead(user);
    return sendOk(reply, { updated });
  });

  app.put('/api/admin/notifications/:key/read', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const key = String((request.params as { key?: string }).key || '');
    const body = readBodySchema.parse(request.body);
    await services.notificationService.markRead(user, key, body.read);
    return sendOk(reply, { ok: true });
  });

  app.delete('/api/admin/notifications/:key', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const key = String((request.params as { key?: string }).key || '');
    await services.notificationService.dismiss(user, key);
    return sendOk(reply, { ok: true });
  });
}
