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
    const parentId = normalizeParentId(body.parentId);
    await assertValidParent(services, user.id, 0, parentId);
    return sendOk(reply, await services.repo.createFolder({ userId: user.id, parentId, name: body.name, icon: body.icon || '', description: body.description || '', sortOrder: Number(body.sortOrder || createSortOrder()), passwordHash: body.password ? await hashPassword(body.password) : null, passwordHint: body.passwordHint || '' }));
  });

  app.put('/api/admin/folders/reorder', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any).ids);
    await services.repo.reorderFolders(user.id, ids);
    return sendOk(reply, { ok: true });
  });

  app.post('/api/admin/folders/bulk-delete', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any).ids);
    const folders = await services.repo.listFolders(user.id);
    const links = await services.repo.listLinks(user.id);
    const ownedIds = new Set(folders.map((folder) => folder.id));
    const rootIds = ids.filter((id) => ownedIds.has(id));
    const affectedIds = collectFolderTreeIds(folders, rootIds);
    await services.repo.deleteFolders(user.id, rootIds);
    return sendOk(reply, {
      deletedFolders: affectedIds.size,
      deletedLinks: links.filter((link) => affectedIds.has(link.folderId)).length,
    });
  });

  app.put('/api/admin/folders/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = request.body as any;
    const id = Number((request.params as any).id);
    const input = { ...body };
    if ('parentId' in input) {
      input.parentId = normalizeParentId(input.parentId);
      await assertValidParent(services, user.id, id, input.parentId);
    }
    return sendOk(reply, await services.repo.updateFolder(user.id, id, input));
  });

  app.delete('/api/admin/folders/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    await services.repo.deleteFolder(user.id, Number((request.params as any).id));
    return sendOk(reply, { ok: true });
  });
}

function normalizeParentId(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parentId = Number(value);
  if (!Number.isInteger(parentId) || parentId < 1) throw Object.assign(new Error('Invalid parent folder'), { statusCode: 400 });
  return parentId;
}

async function assertValidParent(services: AppServices, userId: number, folderId: number, parentId: number | null) {
  if (!parentId) return;
  if (parentId === folderId) throw Object.assign(new Error('Folder cannot be its own parent'), { statusCode: 400 });

  const folders = await services.repo.listFolders(userId);
  let cursor = folders.find((folder) => folder.id === parentId);
  if (!cursor) throw Object.assign(new Error('Parent folder not found'), { statusCode: 400 });

  while (cursor?.parentId) {
    if (cursor.parentId === folderId) throw Object.assign(new Error('Folder cannot use a descendant as parent'), { statusCode: 400 });
    cursor = folders.find((folder) => folder.id === cursor?.parentId);
  }
}

function uniqueNumericIds(value: unknown) {
  return [...new Set((Array.isArray(value) ? value : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function collectFolderTreeIds(folders: Array<{ id: number; parentId?: number | null }>, rootIds: number[]) {
  const ids = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}
