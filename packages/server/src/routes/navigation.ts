import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';
import { sendOk } from '../plugins/responses.js';
import { verifyPassword } from '../utils/crypto.js';

export async function navigationRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/navigation/:username', async (request, reply) => {
    const username = (request.params as any).username;
    const site = await findNavigationSite(services, username);
    if (!site) throw Object.assign(new Error('Navigation not found'), { statusCode: 404 });
    const folders = await services.repo.listFolders(site.userId);
    const links = await services.repo.listLinks(site.userId);
    const q = String((request.query as any).q || '').toLowerCase();
    const visibleLinks = q ? links.filter((link) => `${link.name} ${link.description || ''} ${link.url}`.toLowerCase().includes(q)) : links;
    const linksByFolder = new Map<number, typeof visibleLinks>();
    for (const link of visibleLinks) {
      const folderLinks = linksByFolder.get(link.folderId);
      if (folderLinks) folderLinks.push(link);
      else linksByFolder.set(link.folderId, [link]);
    }
    return sendOk(reply, {
      site,
      folders: folders.map((folder) => ({
        ...folder,
        links: folder.passwordHash ? [] : linksByFolder.get(folder.id) || [],
        locked: Boolean(folder.passwordHash),
      })),
    });
  });

  app.get('/api/v1/allsiteandlinks/:username', async (request, reply) => {
    const username = (request.params as any).username;
    const site = await services.repo.getSiteBySlug(username);
    if (!site) throw Object.assign(new Error('user not found'), { statusCode: 404 });
    const folders = await services.repo.listFolders(site.userId);
    const links = await services.repo.listLinks(site.userId);
    const linksByFolder = new Map<number, typeof links>();
    for (const link of links) {
      const folderLinks = linksByFolder.get(link.folderId);
      if (folderLinks) folderLinks.push(link);
      else linksByFolder.set(link.folderId, [link]);
    }
    return reply.send({
      code: 0,
      data: {
        site_info: {
          name: site.name,
          info: site.description,
          bg: site.backgroundImage,
          bg_color: site.backgroundColor,
          font_color: site.fontColor,
          search_engine: 'google',
          search_url_template: site.searchUrlTemplate,
          local_search_first: site.localSearchFirst,
        },
        folder_with_links: folders.map((folder) => ({ ...folder, links: linksByFolder.get(folder.id) || [] })),
        target: { id: site.user.id, name: site.user.username },
        me: null,
      },
      message: '',
    });
  });

  app.post('/api/navigation/:username/folder/:id/verify', async (request, reply) => {
    const site = await findNavigationSite(services, (request.params as any).username);
    if (!site) throw Object.assign(new Error('Navigation not found'), { statusCode: 404 });
    const folder = await services.repo.getFolder(site.userId, Number((request.params as any).id));
    if (!folder?.passwordHash) return sendOk(reply, { verified: true });
    const ok = await verifyPassword(String((request.body as any)?.password || ''), folder.passwordHash);
    return sendOk(reply, { verified: ok, links: ok ? (await services.repo.listLinks(site.userId)).filter((link) => link.folderId === folder.id) : [] });
  });
}

async function findNavigationSite(services: AppServices, slug: string) {
  const exactSite = await services.repo.getSiteBySlug(slug);
  if (exactSite || slug !== 'admin') return exactSite;

  const users = await services.repo.listUsers();
  const admin = users.find((user) => user.role === 'admin');
  return admin ? services.repo.getSite(admin.id) : null;
}
