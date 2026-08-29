import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { hashPassword } from '../../utils/crypto.js';
import { createSortOrder } from '../../utils/sort-order.js';
import type { FolderRecord } from '../../services/repository.js';
import { setAuditContext } from '../../plugins/audit.js';
import { numericParam } from '../../utils/route-params.js';

const folderUpdateSchema = z.object({
  parentId: z.union([z.number().int().positive(), z.null(), z.literal('')]).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  icon: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  sortOrder: z.number().finite().optional(),
  password: z.string().max(200).optional(),
  passwordHint: z.string().max(120).optional(),
});

const folderCreateSchema = folderUpdateSchema.extend({
  name: z.string().trim().min(1).max(120),
});

export async function folderRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/folders', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await services.repo.listFolders(user.id));
  });

  app.post('/api/admin/folders', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = folderCreateSchema.parse(request.body);
    const parentId = normalizeParentId(body.parentId);
    setAuditContext(request, {
      action: 'create',
      resourceType: parentId ? 'folder' : 'notab',
      resourceLabel: String(body.name || '').trim() || null,
    });
    await assertValidParent(services, user.id, 0, parentId);
    const created = await services.repo.createFolder({ userId: user.id, parentId, name: body.name, icon: body.icon || '', description: body.description || '', sortOrder: Number(body.sortOrder || createSortOrder()), passwordHash: body.password ? await hashPassword(body.password) : null, passwordHint: body.passwordHint || '' });
    setAuditContext(request, { resourceId: created.id, resourceLabel: created.name, details: { after: folderAuditSnapshot(created) } });
    return sendOk(reply, created);
  });

  app.put('/api/admin/folders/reorder', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any).ids);
    await services.repo.reorderFolders(user.id, ids);
    setAuditContext(request, { action: 'reorder', resourceType: 'folder', resourceId: ids.join(','), details: { ids } });
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
    const before = folders.filter((folder) => affectedIds.has(folder.id)).map(folderAuditSnapshot);
    await services.repo.deleteFolders(user.id, rootIds);
    setAuditContext(request, { action: 'bulk_delete', resourceType: 'folder', resourceId: rootIds.join(','), details: { before } });
    return sendOk(reply, {
      deletedFolders: affectedIds.size,
      deletedLinks: links.filter((link) => affectedIds.has(link.folderId)).length,
    });
  });

  app.put('/api/admin/folders/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const id = numericParam(request);
    const { password, parentId, ...fields } = folderUpdateSchema.parse(request.body);
    setAuditContext(request, { action: 'update', resourceType: 'folder', resourceId: id });
    const current = await services.repo.getFolder(user.id, id);
    if (!current) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    const before = folderAuditSnapshot(current);
    const input: Partial<FolderRecord> = { ...fields };
    if (parentId !== undefined) input.parentId = normalizeParentId(parentId);
    if (password !== undefined) input.passwordHash = password ? await hashPassword(password) : null;
    if ('parentId' in input) {
      await assertValidParent(services, user.id, id, input.parentId ?? null);
      if ((current.parentId ?? null) !== input.parentId) input.sortOrder = createSortOrder();
    }
    const updated = await services.repo.updateFolder(user.id, id, input);
    setAuditContext(request, {
      resourceType: updated.parentId ? 'folder' : 'notab',
      resourceLabel: updated.name,
      details: { before, after: folderAuditSnapshot(updated) },
    });
    return sendOk(reply, updated);
  });

  app.delete('/api/admin/folders/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const id = numericParam(request);
    const current = await services.repo.getFolder(user.id, id);
    await services.repo.deleteFolder(user.id, id);
    setAuditContext(request, {
      action: 'delete',
      resourceType: current?.parentId ? 'folder' : 'notab',
      resourceId: id,
      resourceLabel: current?.name || null,
      details: { before: current ? folderAuditSnapshot(current) : null },
    });
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

function folderAuditSnapshot(folder: FolderRecord) {
  return {
    id: folder.id,
    parentId: folder.parentId ?? null,
    name: folder.name,
    icon: folder.icon || '',
    description: folder.description || '',
    sortOrder: folder.sortOrder,
    locked: Boolean(folder.passwordHash),
    passwordHint: folder.passwordHint || '',
  };
}
