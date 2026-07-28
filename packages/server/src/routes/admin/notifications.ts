import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import type { AppServices } from '../../types.js';
import { resolveRequestLocale } from '../../utils/i18n.js';

const notificationSourceSchema = z.enum(['nodesk', 'nomoney', 'nostar', 'links', 'backup']);
const sourceFilterSchema = z.preprocess(
  (value) => typeof value === 'string' ? value.split(',').map((source) => source.trim()).filter(Boolean) : value,
  z.array(notificationSourceSchema).min(1).max(5).optional(),
).transform((sources) => sources ? [...new Set(sources)] : undefined);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  sources: sourceFilterSchema,
});

const markAllQuerySchema = z.object({
  sources: sourceFilterSchema,
});

const readBodySchema = z.object({
  read: z.boolean(),
});

export async function notificationRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/notifications', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const query = listQuerySchema.parse(request.query);
    return sendOk(reply, await services.notificationService.list(user, {
      limit: query.limit,
      locale: resolveRequestLocale(request.headers as Record<string, unknown>),
      ...(query.sources ? { sources: query.sources } : {}),
    }));
  });

  app.post('/api/admin/notifications/mark-all-read', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const query = markAllQuerySchema.parse(request.query);
    const updated = query.sources
      ? await services.notificationService.markAllRead(user, { sources: query.sources })
      : await services.notificationService.markAllRead(user);
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
