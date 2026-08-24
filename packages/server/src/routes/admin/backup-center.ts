import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isBearerRequest, requireAdmin } from '../../plugins/auth.js';
import { setAuditContext } from '../../plugins/audit.js';
import { sendOk } from '../../plugins/responses.js';
import { BACKUP_MODULES } from '../../services/backup-center.service.js';
import type { AppServices } from '../../types.js';

const moduleSchema = z.enum(BACKUP_MODULES);
const modulesSchema = z.object({ modules: z.array(moduleSchema).min(1).max(BACKUP_MODULES.length).optional() });

export async function backupCenterRoutes(app: FastifyInstance, services: AppServices) {
  async function admin(request: Parameters<typeof requireAdmin>[0], reply: Parameters<typeof requireAdmin>[1]) {
    const user = await requireAdmin(request, reply, services);
    if (!user) return null;
    if (isBearerRequest(request)) {
      reply.status(403).send({ code: 403, data: null, message: 'Stored WebDAV credentials require an administrator session' });
      return null;
    }
    return user;
  }

  app.get('/api/admin/backup-center/webdav/config', async (request, reply) => {
    if (!await admin(request, reply)) return;
    return sendOk(reply, await services.backupCenterService.getWebDavConfig());
  });

  app.put('/api/admin/backup-center/webdav/config', async (request, reply) => {
    if (!await admin(request, reply)) return;
    const input = z.object({
      url: z.string().trim().min(1).max(2048),
      username: z.string().trim().min(1).max(512),
      password: z.string().max(4096).optional(),
    }).parse(request.body);
    const before = await services.backupCenterService.getWebDavConfig();
    const after = await services.backupCenterService.saveWebDavConfig(input);
    setAuditContext(request, { action: 'update', resourceType: 'backup', resourceId: 'webdav-config', resourceLabel: 'WebDAV 备份连接', details: { before, after } });
    return sendOk(reply, after);
  });

  app.post('/api/admin/backup-center/webdav/test', async (request, reply) => {
    if (!await admin(request, reply)) return;
    const result = await services.backupCenterService.testWebDavConnection();
    setAuditContext(request, { action: 'test', resourceType: 'backup', resourceId: 'webdav-config', resourceLabel: 'WebDAV 备份连接' });
    return sendOk(reply, result);
  });

  app.get('/api/admin/backup-center/webdav/history', async (request, reply) => {
    if (!await admin(request, reply)) return;
    return sendOk(reply, { batches: await services.backupCenterService.listWebDavBatches() });
  });

  app.post('/api/admin/backup-center/webdav/backups', async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    const input = modulesSchema.parse(request.body || {});
    const batch = await services.backupCenterService.backupToWebDav(user.id, input.modules || BACKUP_MODULES);
    setAuditContext(request, { action: 'create', resourceType: 'backup', resourceId: batch.id, resourceLabel: batch.scope === 'full' ? '全站 WebDAV 备份' : '模块 WebDAV 备份', details: { batch } });
    return sendOk(reply, batch);
  });

  app.post('/api/admin/backup-center/webdav/restore', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    const input = z.object({ batchId: z.string().regex(/^\d{8}T\d{6}Z(?:-[a-f0-9]{6})?$/), modules: z.array(moduleSchema).min(1).max(BACKUP_MODULES.length).optional() }).parse(request.body);
    const restored = await services.backupCenterService.restoreWebDavBatch(user.id, input.batchId, input.modules);
    setAuditContext(request, { action: 'restore', resourceType: 'backup', resourceId: input.batchId, resourceLabel: 'WebDAV 备份恢复', details: restored });
    return sendOk(reply, restored);
  });

  app.delete('/api/admin/backup-center/webdav/history/:id', async (request, reply) => {
    if (!await admin(request, reply)) return;
    const id = String((request.params as { id?: string }).id || '');
    await services.backupCenterService.removeWebDavBatch(id);
    setAuditContext(request, { action: 'delete', resourceType: 'backup', resourceId: id, resourceLabel: 'WebDAV 备份批次' });
    return sendOk(reply, { ok: true });
  });

  app.get('/api/admin/backup-center/local/:module', async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const module = z.union([moduleSchema, z.literal('all')]).parse((request.params as { module?: string }).module);
    const download = await services.backupCenterService.createLocalBackup(user.id, module);
    reply.header('content-disposition', `attachment; filename="${download.filename}"`);
    reply.header('content-length', String(download.body.length));
    reply.type(download.contentType);
    return reply.send(download.body);
  });

  app.post('/api/admin/backup-center/local/:module/restore', { bodyLimit: 256 * 1024 * 1024 }, async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const module = z.union([moduleSchema, z.literal('all')]).parse((request.params as { module?: string }).module);
    const body = Buffer.from(JSON.stringify(request.body));
    const restored = await services.backupCenterService.restoreLocalBackup(user.id, module, body);
    setAuditContext(request, { action: 'restore', resourceType: 'backup', resourceId: module, resourceLabel: '本地上传恢复', details: restored });
    return sendOk(reply, restored);
  });
}
