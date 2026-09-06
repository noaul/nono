import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { isBearerRequest, requireAdmin } from '../../plugins/auth.js';
import { setAuditContext } from '../../plugins/audit.js';
import { sendOk } from '../../plugins/responses.js';
import { BACKUP_MODULES } from '../../services/backup-center.service.js';
import type { AppServices } from '../../types.js';

const moduleSchema = z.enum(BACKUP_MODULES);
const modulesSchema = z.object({ modules: z.array(moduleSchema).min(1).max(BACKUP_MODULES.length).optional() });

export async function backupCenterRoutes(app: FastifyInstance, services: AppServices) {
  /**
   * Every route here either uses stored WebDAV credentials or moves the whole dataset, so all of
   * them need an administrator at a browser, not a token. A `*`-scoped API token would otherwise
   * export the entire database in one GET and overwrite it in one POST.
   */
  async function admin(request: Parameters<typeof requireAdmin>[0], reply: Parameters<typeof requireAdmin>[1]) {
    const user = await requireAdmin(request, reply, services);
    if (!user) return null;
    if (isBearerRequest(request)) {
      reply.status(403).send({ code: 403, data: null, message: 'Backup and restore require an administrator session' });
      return null;
    }
    return user;
  }

  function submit(request: Parameters<typeof requireAdmin>[0], reply: Parameters<typeof requireAdmin>[1], userId: number, kind: string, input: unknown, work: () => Promise<unknown>) {
    const requestId = z.string().min(1).max(128).parse(request.headers['idempotency-key']);
    const job = services.backupJobService.submit({ userId, requestId, kind, fingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex') }, work);
    setAuditContext(request, { action: kind.includes('restore') ? 'restore' : 'create', resourceType: 'backup', resourceId: job.id, resourceLabel: '备份任务已接受', details: { jobId: job.id, status: job.status } });
    reply.status(202).header('location', `/api/admin/backup-center/jobs/${job.id}`);
    return sendOk(reply, job);
  }

  app.get('/api/admin/backup-center/jobs', async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    return sendOk(reply, { jobs: services.backupJobService.list(user.id) });
  });
  app.get('/api/admin/backup-center/jobs/:id', async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    return sendOk(reply, services.backupJobService.get((request.params as { id: string }).id, user.id));
  });
  app.get('/api/admin/backup-center/jobs/:id/download', async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    const download = services.backupJobService.download((request.params as { id: string }).id, user.id);
    reply.header('content-disposition', `attachment; filename="${download.filename}"`);
    reply.header('content-length', String(download.size));
    reply.type(download.contentType);
    return reply.send(createReadStream(download.path));
  });

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
    const modules = [...(input.modules || BACKUP_MODULES)].sort();
    return submit(request, reply, user.id, 'webdav-backup', modules, () => services.backupCenterService.backupToWebDav(user.id, modules));
  });

  app.post('/api/admin/backup-center/webdav/restore', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    const input = z.object({ batchId: z.string().regex(/^\d{8}T\d{6}Z(?:-[a-f0-9]{6})?$/), modules: z.array(moduleSchema).min(1).max(BACKUP_MODULES.length).optional() }).parse(request.body);
    return submit(request, reply, user.id, 'webdav-restore', input, () => services.backupCenterService.restoreWebDavBatch(user.id, input.batchId, input.modules));
  });

  app.delete('/api/admin/backup-center/webdav/history/:id', async (request, reply) => {
    if (!await admin(request, reply)) return;
    const id = String((request.params as { id?: string }).id || '');
    await services.backupCenterService.removeWebDavBatch(id);
    setAuditContext(request, { action: 'delete', resourceType: 'backup', resourceId: id, resourceLabel: 'WebDAV 备份批次' });
    return sendOk(reply, { ok: true });
  });

  app.post('/api/admin/backup-center/local/:module', async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    const module = z.union([moduleSchema, z.literal('all')]).parse((request.params as { module?: string }).module);
    return submit(request, reply, user.id, 'local-backup', module, () => services.backupCenterService.createLocalBackup(user.id, module));
  });

  app.post('/api/admin/backup-center/local/:module/restore', { bodyLimit: 256 * 1024 * 1024 }, async (request, reply) => {
    const user = await admin(request, reply);
    if (!user) return;
    const module = z.union([moduleSchema, z.literal('all')]).parse((request.params as { module?: string }).module);
    const body = Buffer.from(JSON.stringify(request.body));
    return submit(request, reply, user.id, 'local-restore', { module, body: request.body }, () => services.backupCenterService.restoreLocalBackup(user.id, module, body));
  });
}
