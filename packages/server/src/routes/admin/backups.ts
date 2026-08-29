import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAdminSession } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { setAuditContext } from '../../plugins/audit.js';

const automationSchema = z.object({
  enabled: z.boolean(),
  cadence: z.enum(['daily', 'weekly']),
  hour: z.number().int().min(0).max(23),
  weekday: z.number().int().min(0).max(6),
  retentionDays: z.number().int().min(1).max(3650),
  maxBackups: z.number().int().min(2).max(365),
});

export async function backupRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/backups/automation', async (request, reply) => {
    const admin = await requireAdminSession(request, reply, services);
    if (!admin) return;
    return sendOk(reply, await services.backupAutomationService.get());
  });

  app.put('/api/admin/backups/automation', async (request, reply) => {
    const admin = await requireAdminSession(request, reply, services);
    if (!admin) return;
    const before = await services.backupAutomationService.get();
    const updated = await services.backupAutomationService.update(automationSchema.parse(request.body));
    setAuditContext(request, { action: 'update', resourceType: 'backup', resourceId: 'automation', resourceLabel: '自动备份策略', details: { before, after: updated } });
    return sendOk(reply, updated);
  });

  app.get('/api/admin/backups', async (request, reply) => {
    const admin = await requireAdminSession(request, reply, services);
    if (!admin) return;
    return sendOk(reply, { backups: await services.backupService.list() });
  });

  app.post('/api/admin/backups', async (request, reply) => {
    const admin = await requireAdminSession(request, reply, services);
    if (!admin) return;
    const result = await services.backupAutomationService.runNow();
    setAuditContext(request, { action: 'create', resourceType: 'backup', resourceId: result.backup.id, resourceLabel: result.backup.id, details: { backup: result.backup, removed: result.removed } });
    return sendOk(reply, {
      backup: result.backup,
      removed: result.removed,
      automation: await services.backupAutomationService.get(),
    });
  });

  app.get('/api/admin/backups/:id/download', async (request, reply) => {
    const admin = await requireAdminSession(request, reply, services);
    if (!admin) return;
    const id = String((request.params as { id?: string }).id || '');
    const download = await services.backupService.resolveDownload(id);
    reply.header('content-disposition', `attachment; filename="${download.filename}"`);
    reply.header('content-length', String(download.size));
    reply.type('application/gzip');
    return reply.send(fs.createReadStream(download.path));
  });

  app.delete('/api/admin/backups/:id', async (request, reply) => {
    const admin = await requireAdminSession(request, reply, services);
    if (!admin) return;
    const id = String((request.params as { id?: string }).id || '');
    await services.backupService.remove(id);
    setAuditContext(request, { action: 'delete', resourceType: 'backup', resourceId: id, resourceLabel: id, details: { backupId: id } });
    return sendOk(reply, { ok: true });
  });
}
