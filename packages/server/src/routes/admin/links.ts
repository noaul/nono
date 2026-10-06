import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { duplicateUrlKey, normalizeUrl } from '../../services/bookmark.service.js';
import { shortenBookmarkName } from '../../services/bookmark-name.service.js';
import { checkLinksHealth, shouldSkipLinkHealthCheck } from '../../services/link-health.service.js';
import { normalizeTags, type FolderRecord, type LinkRecord } from '../../services/repository.js';
import { createSortOrder } from '../../utils/sort-order.js';
import { setAuditContext } from '../../plugins/audit.js';
import { numericParam } from '../../utils/route-params.js';
import { currentSessionId } from '../../services/session.service.js';

const linkUpdateSchema = z.object({
  folderId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().max(240).optional(),
  url: z.string().trim().min(1).max(4096).optional(),
  icon: z.string().max(2048).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  sortOrder: z.coerce.number().finite().optional(),
  healthCheckEnabled: z.boolean().optional(),
  /** true queues the link in the reading inbox (and marks it unread); false takes it out. */
  readLater: z.boolean().optional(),
  /** Marks a link read or unread; marking read also queues a link that was never queued. */
  read: z.boolean().optional(),
  tags: z.array(z.string().max(200)).max(100).optional(),
});

const linkCreateSchema = z.object({
  folderId: z.coerce.number().int().positive(),
  name: z.string().trim().max(240).optional().default(''),
  nameMode: z.enum(['auto', 'manual']).optional().default('auto'),
  url: z.string().trim().min(1).max(4096),
  icon: z.string().max(2048).optional().default(''),
  description: z.string().max(2000).optional().default(''),
  sortOrder: z.coerce.number().finite().optional(),
  /** Save even when the URL is already bookmarked ("save another copy"). */
  allowDuplicate: z.boolean().optional().default(false),
  /** Queue the bookmark for reading later; an existing bookmark for the URL is queued instead. */
  readLater: z.boolean().optional().default(false),
  tags: z.array(z.string().max(200)).max(100).optional().default([]),
});

const tagRenameSchema = z.object({
  from: z.string().trim().min(1).max(200),
  to: z.string().max(200),
});

const tagParamSchema = z.object({ name: z.string().trim().min(1).max(200) });

const lookupSchema = z.object({ url: z.string().trim().min(1).max(4096) });

const readingListSchema = z.object({
  status: z.enum(['unread', 'read']).optional().default('unread'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
});

const linkMoveSchema = z.object({
  linkId: z.coerce.number().int().positive(),
  targetFolderId: z.coerce.number().int().positive(),
  sourceIds: z.array(z.coerce.number().int().positive()).max(5000),
  targetIds: z.array(z.coerce.number().int().positive()).min(1).max(5000),
});

const linkSearchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  folderId: z.coerce.number().int().positive().optional(),
});

export async function linkRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/links/search', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = linkSearchSchema.parse(request.query);
    const folders = await services.repo.listFolders(user.id);
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    let folderIds: number[] | undefined;
    if (input.folderId) {
      if (!byId.has(input.folderId)) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
      folderIds = descendantFolderIds(folders, input.folderId);
    }
    const hits = await services.repo.searchLinks(user.id, input.q, { limit: input.limit, folderIds });
    return sendOk(reply, {
      query: input.q,
      items: hits.map((hit) => ({ ...hit, folderPath: folderPath(byId, hit.folderId) })),
    });
  });

  app.get('/api/admin/reading', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = readingListSchema.parse(request.query);
    const [page, folders] = await Promise.all([services.repo.listReadingLinks(user.id, input), services.repo.listFolders(user.id)]);
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    return sendOk(reply, { ...page, items: page.items.map((link) => ({ ...link, folderPath: folderPath(byId, link.folderId) })) });
  });

  app.get('/api/admin/tags', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await services.repo.listTags(user.id));
  });

  // Renaming onto a tag a link already has merges the two on that link.
  app.put('/api/admin/tags/rename', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = tagRenameSchema.parse(request.body);
    const [to] = normalizeTags([input.to]);
    if (!to) throw Object.assign(new Error('Tag name is required'), { statusCode: 400 });
    const affected = await services.repo.listLinksWithTag(user.id, input.from);
    for (const link of affected) {
      await services.repo.updateLink(user.id, link.id, { tags: normalizeTags((link.tags || []).map((tag) => (tag === input.from ? to : tag))) });
    }
    setAuditContext(request, { action: 'update', resourceType: 'tag', resourceId: input.from, resourceLabel: to, details: { from: input.from, to, links: affected.length } });
    return sendOk(reply, { renamed: affected.length, name: to });
  });

  app.delete('/api/admin/tags/:name', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const { name } = tagParamSchema.parse(request.params);
    const affected = await services.repo.listLinksWithTag(user.id, name);
    for (const link of affected) {
      await services.repo.updateLink(user.id, link.id, { tags: (link.tags || []).filter((tag) => tag !== name) });
    }
    setAuditContext(request, { action: 'delete', resourceType: 'tag', resourceId: name, resourceLabel: name, details: { links: affected.length } });
    return sendOk(reply, { removed: affected.length });
  });

  // "Is this page bookmarked?" for the browser extension's toolbar badge.
  app.post('/api/admin/links/lookup', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    setAuditContext(request, { skip: true });
    const { url: raw } = lookupSchema.parse(request.body);
    let url: string;
    try {
      url = normalizeUrl(raw);
    } catch {
      return sendOk(reply, { saved: false });
    }
    const link = await services.repo.findLinkByUrl(user.id, url);
    if (!link) return sendOk(reply, { saved: false });
    const folders = await services.repo.listFolders(user.id);
    return sendOk(reply, {
      saved: true,
      link: {
        id: link.id,
        name: link.name,
        folderId: link.folderId,
        folderPath: folderPath(new Map(folders.map((folder) => [folder.id, folder])), link.folderId),
        tags: link.tags || [],
        readLaterAt: link.readLaterAt || null,
        readAt: link.readAt || null,
      },
    });
  });

  app.get('/api/admin/links', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await services.repo.listLinks(user.id));
  });

  app.post('/api/admin/links', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = linkCreateSchema.parse(request.body);
    const folder = await services.repo.getFolder(user.id, Number(body.folderId));
    if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    const url = normalizeUrl(body.url);
    if (!body.allowDuplicate) {
      const existing = await services.repo.findLinkByUrl(user.id, url);
      if (existing) {
        setAuditContext(request, { skip: true });
        const queued = body.readLater && (!existing.readLaterAt || existing.readAt)
          ? await services.repo.updateLink(user.id, existing.id, { readLaterAt: new Date(), readAt: null })
          : existing;
        return sendOk(reply, { ...queued, existing: true });
      }
    }
    const name = body.nameMode === 'manual' ? String(body.name || '').trim() || shortenBookmarkName('', url) : shortenBookmarkName(body.name, url);
    const created = await services.repo.createLink({
      folderId: folder.id,
      name,
      url,
      icon: body.icon || '',
      description: body.description || '',
      sortOrder: Number(body.sortOrder || createSortOrder()),
      healthCheckEnabled: !shouldSkipLinkHealthCheck(url),
      readLaterAt: body.readLater ? new Date() : null,
      tags: normalizeTags(body.tags),
    });
    setAuditContext(request, { action: 'create', resourceType: 'bookmark', resourceId: created.id, resourceLabel: created.name, details: { after: linkAuditSnapshot(created) } });
    return sendOk(reply, created);
  });

  app.put('/api/admin/links/reorder', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any).ids);
    await services.repo.reorderLinks(user.id, ids);
    setAuditContext(request, { action: 'reorder', resourceType: 'bookmark', resourceId: ids.join(','), details: { ids } });
    return sendOk(reply, { ok: true });
  });

  app.put('/api/admin/links/move', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = linkMoveSchema.parse(request.body);
    const current = await services.repo.getLink(user.id, body.linkId);
    if (!current) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    const before = linkAuditSnapshot(current);
    const updated = await services.repo.moveLink(user.id, body.linkId, body.targetFolderId, body.sourceIds, body.targetIds);
    setAuditContext(request, {
      action: 'move',
      resourceType: 'bookmark',
      resourceId: updated.id,
      resourceLabel: updated.name,
      details: { before, after: linkAuditSnapshot(updated), sourceIds: body.sourceIds, targetIds: body.targetIds },
    });
    return sendOk(reply, updated);
  });

  app.get('/api/admin/links/duplicates', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const links = await services.repo.listLinks(user.id);
    const groups = new Map<string, typeof links>();
    for (const link of links) {
      const key = duplicateUrlKey(link.url);
      groups.set(key, [...(groups.get(key) || []), link]);
    }
    return sendOk(reply, {
      groups: [...groups.entries()]
        .map(([url, items]) => ({ url, links: items }))
        .filter((group) => group.links.length > 1),
    });
  });

  app.post('/api/admin/links/bulk-move', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = request.body as any;
    const ids = uniqueNumericIds(body.ids);
    const folder = await services.repo.getFolder(user.id, Number(body.folderId));
    if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    const before = (await services.repo.getLinksByIds(user.id, ids)).map(linkAuditSnapshot);
    for (const [index, id] of ids.entries()) {
      await services.repo.updateLink(user.id, id, { folderId: folder.id, sortOrder: createSortOrder(index) });
    }
    const after = (await services.repo.getLinksByIds(user.id, ids)).map(linkAuditSnapshot);
    setAuditContext(request, { action: 'bulk_move', resourceType: 'bookmark', resourceId: ids.join(','), resourceLabel: folder.name, details: { before, after } });
    return sendOk(reply, { moved: ids.length });
  });

  app.post('/api/admin/links/bulk-delete', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any).ids);
    const owned = await services.repo.getLinksByIds(user.id, ids);
    const ownedIds = new Set(owned.map((link) => link.id));
    const deleteIds = ids.filter((id) => ownedIds.has(id));
    const before = owned.map(linkAuditSnapshot);
    await services.repo.deleteLinks(user.id, deleteIds);
    setAuditContext(request, { action: 'bulk_delete', resourceType: 'bookmark', resourceId: deleteIds.join(','), details: { before } });
    return sendOk(reply, { deleted: deleteIds.length });
  });

  app.post('/api/admin/links/health-check', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any)?.ids);
    const result = await checkLinksHealth(
      ids.length ? await services.repo.getLinksByIds(user.id, ids) : await services.repo.listLinks(user.id),
      services.safeRequester,
      {
        allowPrivateHosts: user.role === 'admin' && currentSessionId(request) ? services.privateOutboundHosts : [],
        concurrency: 4,
      },
    );
    await services.repo.updateLinkHealth(user.id, result.results.map((item) => ({
      id: item.id,
      url: item.url,
      status: item.status,
      statusCode: item.statusCode,
      reason: item.reason,
      finalUrl: item.finalUrl,
      checkedAt: new Date(item.checkedAt),
    })));
    return sendOk(reply, result);
  });

  app.post('/api/admin/links/health-repair', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any)?.ids);
    const ownedLinks = await services.repo.getLinksByIds(user.id, ids);
    const byId = new Map(ownedLinks.map((link) => [link.id, link]));
    const repaired: LinkRecord[] = [];

    for (const id of ids) {
      const link = byId.get(id);
      const finalUrl = link?.healthStatus === 'redirected' ? validRepairUrl(link.healthFinalUrl) : null;
      if (!link || !finalUrl) continue;
      repaired.push(await services.repo.updateLink(user.id, link.id, {
        url: finalUrl,
        healthStatus: 'ok',
        healthReason: null,
        healthFinalUrl: null,
      }));
    }

    return sendOk(reply, { repaired: repaired.length, skipped: ids.length - repaired.length, links: repaired });
  });

  app.put('/api/admin/links/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const { readLater, read, tags, ...fields } = linkUpdateSchema.parse(request.body);
    const body: Partial<LinkRecord> = fields;
    if (tags) body.tags = normalizeTags(tags);
    const linkId = numericParam(request);
    const current = await services.repo.getLink(user.id, linkId);
    if (!current) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    Object.assign(body, readingChanges(current, readLater, read));
    const before = linkAuditSnapshot(current);
    if ('url' in body) {
      body.url = normalizeUrl(String(body.url ?? ''));
      if (body.url !== current.url) {
        Object.assign(body, {
          ...(shouldSkipLinkHealthCheck(body.url) ? { healthCheckEnabled: false } : {}),
          healthStatus: null,
          healthStatusCode: null,
          healthReason: null,
          healthFinalUrl: null,
          healthCheckedAt: null,
        });
      }
    }
    if (body.healthCheckEnabled === false) {
      Object.assign(body, {
        healthStatus: null,
        healthStatusCode: null,
        healthReason: null,
        healthFinalUrl: null,
        healthCheckedAt: null,
      });
    }
    if ('folderId' in body) {
      const folder = await services.repo.getFolder(user.id, Number(body.folderId));
      if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
      body.folderId = folder.id;
      if (current.folderId !== Number(body.folderId)) body.sortOrder = createSortOrder();
    }
    const updated = await services.repo.updateLink(user.id, linkId, body);
    setAuditContext(request, { action: 'update', resourceType: 'bookmark', resourceId: updated.id, resourceLabel: updated.name, details: { before, after: linkAuditSnapshot(updated) } });
    return sendOk(reply, updated);
  });

  app.delete('/api/admin/links/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const id = numericParam(request);
    const before = await services.repo.getLink(user.id, id);
    await services.repo.deleteLink(user.id, id);
    setAuditContext(request, { action: 'delete', resourceType: 'bookmark', resourceId: id, resourceLabel: before?.name || null, details: { before: before ? linkAuditSnapshot(before) : null } });
    return sendOk(reply, { ok: true });
  });
}

function readingChanges(current: LinkRecord, readLater: boolean | undefined, read: boolean | undefined): Partial<LinkRecord> {
  const now = new Date();
  if (readLater === false) return { readLaterAt: null, readAt: null };
  const changes: Partial<LinkRecord> = {};
  if (readLater === true) Object.assign(changes, { readLaterAt: now, readAt: null });
  if (read === true) Object.assign(changes, { readLaterAt: changes.readLaterAt || current.readLaterAt || now, readAt: now });
  if (read === false && current.readLaterAt) changes.readAt = null;
  return changes;
}

function uniqueNumericIds(value: unknown) {
  return [...new Set((Array.isArray(value) ? value : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function validRepairUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function linkAuditSnapshot(link: LinkRecord) {
  return {
    id: link.id,
    folderId: link.folderId,
    name: link.name,
    url: link.url,
    icon: link.icon || '',
    description: link.description || '',
    sortOrder: link.sortOrder,
    healthCheckEnabled: link.healthCheckEnabled !== false,
    tags: link.tags || [],
  };
}

function descendantFolderIds(folders: FolderRecord[], rootId: number) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

function folderPath(byId: Map<number, FolderRecord>, folderId: number) {
  const names: string[] = [];
  const seen = new Set<number>();
  for (let folder = byId.get(folderId); folder && !seen.has(folder.id); folder = folder.parentId ? byId.get(folder.parentId) : undefined) {
    seen.add(folder.id);
    names.unshift(folder.name);
  }
  return names;
}
