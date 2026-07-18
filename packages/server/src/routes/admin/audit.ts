import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import type { AppServices } from '../../types.js';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  actor: z.string().trim().max(120).optional(),
  action: z.string().trim().max(80).optional(),
  resourceType: z.string().trim().max(80).optional(),
  result: z.enum(['success', 'failure']).optional(),
  search: z.string().trim().max(160).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const settingsSchema = z.object({
  retentionDays: z.number().int().min(7).max(3650),
});

export async function auditRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/audit', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    const query = querySchema.parse(request.query);
    return sendOk(reply, await services.auditLogService.list({
      ...query,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    }));
  });

  app.get('/api/admin/audit/settings', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, await services.auditLogService.getSettings());
  });

  app.put('/api/admin/audit/settings', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, await services.auditLogService.updateSettings(settingsSchema.parse(request.body)));
  });
}
