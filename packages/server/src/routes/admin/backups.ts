import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAdmin } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';

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
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, await services.backupAutomationService.get());
  });

  app.put('/api/admin/backups/automation', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, await services.backupAutomationService.update(automationSchema.parse(request.body)));
  });

  app.get('/api/admin/backups', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, { backups: await services.backupService.list() });
  });

  app.post('/api/admin/backups', { config: { rateLimit: { max: 2, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    const result = await services.backupAutomationService.runNow();
    return sendOk(reply, {
      backup: result.backup,
      removed: result.removed,
      automation: await services.backupAutomationService.get(),
    });
  });

  app.get('/api/admin/backups/:id/download', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    const id = String((request.params as { id?: string }).id || '');
    const download = await services.backupService.resolveDownload(id);
    reply.header('content-disposition', `attachment; filename="${download.filename}"`);
    reply.header('content-length', String(download.size));
    reply.type('application/gzip');
    return reply.send(fs.createReadStream(download.path));
  });

  app.delete('/api/admin/backups/:id', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    const id = String((request.params as { id?: string }).id || '');
    await services.backupService.remove(id);
    return sendOk(reply, { ok: true });
  });
}
