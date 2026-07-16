import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { exportBookmarksHtml, importBookmarks, previewBookmarksImport } from '../../services/bookmark.service.js';

export async function bookmarkRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/admin/bookmarks/preview', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const html = String((request.body as any)?.html || '');
    if (!html.trim()) throw Object.assign(new Error('Bookmark HTML is required'), { statusCode: 400 });
    return sendOk(reply, await previewBookmarksImport(services.repo, user.id, html));
  });

  app.post('/api/admin/bookmarks/import', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const body = request.body as any;
    const html = String(body?.html || '');
    if (!html.trim()) throw Object.assign(new Error('Bookmark HTML is required'), { statusCode: 400 });
    return sendOk(reply, await importBookmarks(services.repo, user.id, html, body?.selection));
  });

  app.get('/api/admin/bookmarks/export', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const folders = await services.repo.listFolders(user.id);
    const links = await services.repo.listLinks(user.id);
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-disposition', 'attachment; filename="nono-bookmarks.html"')
      .send(exportBookmarksHtml(folders, links));
  });
}
