import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices, Role } from '../../types.js';
import { requireAdmin } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { publicUser } from '../../services/repository.js';
import { setAuditContext } from '../../plugins/audit.js';

const userUpdateSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  email: z.string().email().optional(),
});

const configSchema = z.object({
  allowRegistration: z.boolean().optional(),
  defaultRole: z.enum(['admin', 'user']).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function userRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/users', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, (await services.repo.listUsers()).map(publicUser));
  });

  app.put('/api/admin/users/:id', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    const input = userUpdateSchema.parse(request.body);
    const id = Number((request.params as any).id);
    const current = await services.repo.findUserById(id);
    const before = current ? publicUser(current) : null;
    const updated = publicUser(await services.repo.updateUser(id, input as any));
    setAuditContext(request, { action: 'update', resourceType: 'user', resourceId: id, resourceLabel: current?.username || updated.username, details: { before, after: updated } });
    return sendOk(reply, updated);
  });

  app.delete('/api/admin/users/:id', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    const id = Number((request.params as any).id);
    if (id === admin.id) throw Object.assign(new Error('You cannot delete your own account'), { statusCode: 400 });
    const current = await services.repo.findUserById(id);
    await services.repo.deleteUser(id);
    setAuditContext(request, { action: 'delete', resourceType: 'user', resourceId: id, resourceLabel: current?.username || null, details: { before: current ? publicUser(current) : null } });
    return sendOk(reply, { ok: true });
  });

  app.get('/api/admin/config', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, await services.repo.getConfig());
  });

  app.put('/api/admin/config', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    const input = configSchema.parse(request.body);
    const current = await services.repo.getConfig();
    const before = { ...current, settings: { ...current.settings } };
    const updated = await services.repo.updateConfig(input as { allowRegistration?: boolean; defaultRole?: Role; settings?: Record<string, unknown> });
    setAuditContext(request, { action: 'update', resourceType: 'system', resourceId: 'registration', resourceLabel: '注册与用户策略', details: { before, after: updated } });
    return sendOk(reply, updated);
  });
}
