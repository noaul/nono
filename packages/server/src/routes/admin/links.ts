import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { normalizeUrl } from '../../services/bookmark.service.js';
import { shortenBookmarkName } from '../../services/bookmark-name.service.js';
import { checkLinksHealth } from '../../services/link-health.service.js';
import { createSortOrder } from '../../utils/sort-order.js';

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
    const url = normalizeUrl(body.url);
    const name = body.nameMode === 'manual' ? String(body.name || '').trim() || shortenBookmarkName('', url) : shortenBookmarkName(body.name, url);
    return sendOk(reply, await services.repo.createLink({ folderId: folder.id, name, url, icon: body.icon || '', description: body.description || '', sortOrder: Number(body.sortOrder || createSortOrder()) }));
  });

  app.put('/api/admin/links/reorder', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any).ids);
    await services.repo.reorderLinks(user.id, ids);
    return sendOk(reply, { ok: true });
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
    for (const id of ids) await services.repo.updateLink(user.id, id, { folderId: folder.id });
    return sendOk(reply, { moved: ids.length });
  });

  app.post('/api/admin/links/bulk-delete', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any).ids);
    const ownedIds = new Set((await services.repo.listLinks(user.id)).map((link) => link.id));
    const deleteIds = ids.filter((id) => ownedIds.has(id));
    await services.repo.deleteLinks(user.id, deleteIds);
    return sendOk(reply, { deleted: deleteIds.length });
  });

  app.post('/api/admin/links/health-check', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const ids = uniqueNumericIds((request.body as any)?.ids);
    const idFilter = new Set(ids);
    const links = await services.repo.listLinks(user.id);
    return sendOk(reply, await checkLinksHealth(ids.length ? links.filter((link) => idFilter.has(link.id)) : links));
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

function uniqueNumericIds(value: unknown) {
  return [...new Set((Array.isArray(value) ? value : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}
