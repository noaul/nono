import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAdmin } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';

export async function backupRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/backups', async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, { backups: await services.backupService.list() });
  });

  app.post('/api/admin/backups', { config: { rateLimit: { max: 2, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const admin = await requireAdmin(request, reply, services);
    if (!admin) return;
    return sendOk(reply, { backup: await services.backupService.create() });
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
