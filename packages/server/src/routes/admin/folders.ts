import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { hashPassword } from '../../utils/crypto.js';
import { createSortOrder } from '../../utils/sort-order.js';

export async function folderRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/folders', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await services.repo.listFolders(user.id));
  });

  app.post('/api/admin/folders', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = request.body as any;
    return sendOk(reply, await services.repo.createFolder({ userId: user.id, parentId: body.parentId || null, name: body.name, icon: body.icon || '', description: body.description || '', sortOrder: Number(body.sortOrder || createSortOrder()), passwordHash: body.password ? await hashPassword(body.password) : null, passwordHint: body.passwordHint || '' }));
  });

  app.put('/api/admin/folders/reorder', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = (request.body as any).ids || [];
    for (let index = 0; index < ids.length; index += 1) await services.repo.updateFolder(user.id, Number(ids[index]), { sortOrder: (ids.length - index) * 10 });
    return sendOk(reply, { ok: true });
  });

  app.put('/api/admin/folders/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = request.body as any;
    return sendOk(reply, await services.repo.updateFolder(user.id, Number((request.params as any).id), body));
  });

  app.delete('/api/admin/folders/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    await services.repo.deleteFolder(user.id, Number((request.params as any).id));
    return sendOk(reply, { ok: true });
  });
}
