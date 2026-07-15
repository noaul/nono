import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { sendOk } from '../plugins/responses.js';
import { NodeskContentStore } from '../services/nodesk-content.service.js';
import type { AppServices } from '../types.js';

export async function nodeskRoutes(app: FastifyInstance, services: AppServices) {
  const store = new NodeskContentStore(services.nodeskContentDir);

  app.get('/api/nodesk/content/:resource', async (request, reply) => {
    const resource = String((request.params as { resource?: string }).resource || '');
    return sendOk(reply, await store.readPublicJson(resource));
  });

  app.get('/api/admin/nodesk/files', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const logicalPath = String((request.query as { path?: string }).path || '');
    const content = await store.read(logicalPath);
    return sendOk(reply, { path: logicalPath, contentBase64: content.toString('base64') });
  });

  app.get('/api/admin/nodesk/files/list', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const logicalPath = String((request.query as { path?: string }).path || '');
    return sendOk(reply, await store.list(logicalPath));
  });

  app.post('/api/admin/nodesk/files/batch', { bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const files = (request.body as { files?: unknown })?.files;
    return sendOk(reply, await store.batch(files));
  });
}
