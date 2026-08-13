import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../plugins/auth.js';
import { sendError, sendOk } from '../plugins/responses.js';
import { setAuditContext } from '../plugins/audit.js';
import { NodeskContentStore } from '../services/nodesk-content.service.js';
import type { AppServices } from '../types.js';

export async function nodeskRoutes(app: FastifyInstance, services: AppServices) {
  const store = new NodeskContentStore(services.nodeskContentDir);

  app.get('/images/:filename', async (request, reply) => {
    const filename = String((request.params as { filename?: string }).filename || '');
    if (!/^avatar-[a-f0-9]{64}\.webp$/i.test(filename)) {
      return sendError(reply, 404, 'NoDesk asset not found');
    }
    const content = await store.read(`public/images/${filename}`);
    return reply
      .type('image/webp')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(content);
  });

  app.get('/api/nodesk/content/:resource', async (request, reply) => {
    const resource = String((request.params as { resource?: string }).resource || '');
    return sendOk(reply, await store.readPublicJson(resource));
  });

  app.put('/api/admin/nodesk/workbench', async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const input = z.object({ quickEntriesVisible: z.boolean() }).parse(request.body);
    const site = await services.repo.getSite(user.id);
    if (!site) throw Object.assign(new Error('Site not found'), { statusCode: 404 });
    const before = site.settings.nodeskWorkbench;
    const nodeskWorkbench = { quickEntriesVisible: input.quickEntriesVisible };
    await services.repo.updateSite(user.id, { settings: { ...site.settings, nodeskWorkbench } });
    setAuditContext(request, {
      action: 'update',
      resourceType: 'nodesk',
      resourceId: 'workbench',
      resourceLabel: 'NoDesk 工作台设置',
      details: { before, after: nodeskWorkbench },
    });
    return sendOk(reply, nodeskWorkbench);
  });

  app.get('/api/admin/nodesk/files', async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const logicalPath = String((request.query as { path?: string }).path || '');
    const content = await store.read(logicalPath);
    return sendOk(reply, { path: logicalPath, contentBase64: content.toString('base64') });
  });

  app.get('/api/admin/nodesk/files/list', async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const logicalPath = String((request.query as { path?: string }).path || '');
    return sendOk(reply, await store.list(logicalPath));
  });

  app.post('/api/admin/nodesk/files/batch', { bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
    const user = await requireAdmin(request, reply, services);
    if (!user) return;
    const files = (request.body as { files?: unknown })?.files;
    return sendOk(reply, await store.batch(files));
  });
}
