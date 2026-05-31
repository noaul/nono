import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { normalizeUrl } from '../../services/bookmark.service.js';

export async function linkRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/links', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await services.repo.listLinks(user.id));
  });

  app.post('/api/admin/links', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = request.body as any;
    const folder = await services.repo.getFolder(user.id, Number(body.folderId));
    if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    return sendOk(reply, await services.repo.createLink({ folderId: folder.id, name: body.name, url: normalizeUrl(body.url), icon: body.icon || '', description: body.description || '', sortOrder: Number(body.sortOrder || Date.now()) }));
  });

  app.put('/api/admin/links/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = { ...(request.body as any) };
    if (body.url) body.url = normalizeUrl(body.url);
    return sendOk(reply, await services.repo.updateLink(user.id, Number((request.params as any).id), body));
  });

  app.delete('/api/admin/links/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    await services.repo.deleteLink(user.id, Number((request.params as any).id));
    return sendOk(reply, { ok: true });
  });
}
