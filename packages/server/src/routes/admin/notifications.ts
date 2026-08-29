import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import type { AppServices } from '../../types.js';
import { resolveRequestLocale } from '../../utils/i18n.js';
import { numericParam } from '../../utils/route-params.js';

const notificationSourceSchema = z.enum(['nodesk', 'nomoney', 'yumi', 'nostar', 'links', 'backup']);
const sourceFilterSchema = z.preprocess(
  (value) => typeof value === 'string' ? value.split(',').map((source) => source.trim()).filter(Boolean) : value,
  z.array(notificationSourceSchema).min(1).max(6).optional(),
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

const vpsRenewalBodySchema = z.object({
  requestId: z.string().trim().min(8).max(128),
  expectedExpireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const renewalExpenseBodySchema = z.object({
  amountMinorUnits: z.number().int().nonnegative(),
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

  app.post('/api/admin/yumi/vps/:id/renew', async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const id = numericParam(request);
    return sendOk(reply, await services.noMoneyClient.renewVps(id, vpsRenewalBodySchema.parse(request.body)));
  });

  app.post('/api/admin/yumi/vps/:id/renewals/:renewalId/undo', async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const params = z.object({
      id: z.coerce.number().int().positive(),
      renewalId: z.coerce.number().int().positive(),
    }).parse(request.params);
    return sendOk(reply, await services.noMoneyClient.undoVpsRenewal(params.id, params.renewalId));
  });

  app.put('/api/admin/yumi/vps/:id/renewals/:renewalId/expense', async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const params = z.object({
      id: z.coerce.number().int().positive(),
      renewalId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const body = renewalExpenseBodySchema.parse(request.body);
    return sendOk(reply, await services.noMoneyClient.updateVpsRenewalExpense(params.id, params.renewalId, body.amountMinorUnits));
  });
}
