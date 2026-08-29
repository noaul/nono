import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { normalizeUrl } from '../../services/bookmark.service.js';
import { shortenBookmarkName } from '../../services/bookmark-name.service.js';
import { checkLinksHealth, shouldSkipLinkHealthCheck } from '../../services/link-health.service.js';
import type { LinkRecord } from '../../services/repository.js';
import { createSortOrder } from '../../utils/sort-order.js';
import { setAuditContext } from '../../plugins/audit.js';
import { numericParam } from '../../utils/route-params.js';

const linkUpdateSchema = z.object({
  folderId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().max(240).optional(),
  url: z.string().trim().min(1).max(4096).optional(),
  icon: z.string().max(2048).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  sortOrder: z.coerce.number().finite().optional(),
  healthCheckEnabled: z.boolean().optional(),
});

const linkCreateSchema = z.object({
  folderId: z.coerce.number().int().positive(),
  name: z.string().trim().max(240).optional().default(''),
  nameMode: z.enum(['auto', 'manual']).optional().default('auto'),
  url: z.string().trim().min(1).max(4096),
  icon: z.string().max(2048).optional().default(''),
  description: z.string().max(2000).optional().default(''),
  sortOrder: z.coerce.number().finite().optional(),
});

const linkMoveSchema = z.object({
  linkId: z.coerce.number().int().positive(),
  targetFolderId: z.coerce.number().int().positive(),
  sourceIds: z.array(z.coerce.number().int().positive()).max(5000),
  targetIds: z.array(z.coerce.number().int().positive()).min(1).max(5000),
});

export async function linkRoutes(app: FastifyInstance, services: AppServices) {
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
    const name = body.nameMode === 'manual' ? String(body.name || '').trim() || shortenBookmarkName('', url) : shortenBookmarkName(body.name, url);
    const created = await services.repo.createLink({
      folderId: folder.id,
      name,
      url,
      icon: body.icon || '',
      description: body.description || '',
      sortOrder: Number(body.sortOrder || createSortOrder()),
      healthCheckEnabled: !shouldSkipLinkHealthCheck(url),
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
    const current = (await services.repo.listLinks(user.id)).find((link) => link.id === body.linkId);
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
      const key = normalizeUrl(link.url).toLowerCase();
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
    const before = (await services.repo.listLinks(user.id)).filter((link) => ids.includes(link.id)).map(linkAuditSnapshot);
    for (const [index, id] of ids.entries()) {
      await services.repo.updateLink(user.id, id, { folderId: folder.id, sortOrder: createSortOrder(index) });
    }
    const after = (await services.repo.listLinks(user.id)).filter((link) => ids.includes(link.id)).map(linkAuditSnapshot);
    setAuditContext(request, { action: 'bulk_move', resourceType: 'bookmark', resourceId: ids.join(','), resourceLabel: folder.name, details: { before, after } });
    return sendOk(reply, { moved: ids.length });
  });

  app.post('/api/admin/links/bulk-delete', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any).ids);
    // 两次读取都发生在删除之前，取一次即可（bulk_move 的前后两次快照跨越了修改，不能这样合并）。
    const owned = await services.repo.listLinks(user.id);
    const ownedIds = new Set(owned.map((link) => link.id));
    const deleteIds = ids.filter((id) => ownedIds.has(id));
    const before = owned.filter((link) => deleteIds.includes(link.id)).map(linkAuditSnapshot);
    await services.repo.deleteLinks(user.id, deleteIds);
    setAuditContext(request, { action: 'bulk_delete', resourceType: 'bookmark', resourceId: deleteIds.join(','), details: { before } });
    return sendOk(reply, { deleted: deleteIds.length });
  });

  app.post('/api/admin/links/health-check', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any)?.ids);
    const idFilter = new Set(ids);
    const links = await services.repo.listLinks(user.id);
    const result = await checkLinksHealth(
      ids.length ? links.filter((link) => idFilter.has(link.id)) : links,
      services.safeRequester,
      { allowPrivateHosts: user.role === 'admin' ? services.privateOutboundHosts : [], concurrency: 4 },
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
    const ownedLinks = await services.repo.listLinks(user.id);
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
    const body: Partial<LinkRecord> = linkUpdateSchema.parse(request.body);
    const linkId = numericParam(request);
    const current = (await services.repo.listLinks(user.id)).find((link) => link.id === linkId);
    if (!current) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
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
    const before = (await services.repo.listLinks(user.id)).find((link) => link.id === id);
    await services.repo.deleteLink(user.id, id);
    setAuditContext(request, { action: 'delete', resourceType: 'bookmark', resourceId: id, resourceLabel: before?.name || null, details: { before: before ? linkAuditSnapshot(before) : null } });
    return sendOk(reply, { ok: true });
  });
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
  };
}
