import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppServices } from '../types.js';
import { sendOk } from '../plugins/responses.js';
import { resolveUser } from '../plugins/auth.js';
import { createNavigationAccessToken, verifyNavigationAccessToken, verifyPassword } from '../utils/crypto.js';
import type { FolderRecord, LinkRecord, SiteRecord } from '../services/repository.js';
import { numericParam } from '../utils/route-params.js';

const NAVIGATION_ACCESS_COOKIE = 'nono_navigation_access';
const MAX_BACKGROUND_BYTES = 12 * 1024 * 1024;
const BACKGROUND_FETCH_TIMEOUT_MS = 12_000;
const BACKGROUND_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_BACKGROUND_CACHE_ENTRIES = 16;

type BackgroundCacheEntry = {
  body: Buffer;
  contentType: string;
  expiresAt: number;
};

export async function navigationRoutes(app: FastifyInstance, services: AppServices) {
  const backgroundCache = new Map<string, BackgroundCacheEntry>();

  app.get('/api/navigation/:username/background', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const site = await findNavigationSite(services, (request.params as any).username);
    if (!site) throw Object.assign(new Error('Navigation not found'), { statusCode: 404 });
    if (!site.backgroundImage) throw Object.assign(new Error('Background image not configured'), { statusCode: 404 });

    const cached = backgroundCache.get(site.backgroundImage);
    if (cached && cached.expiresAt > Date.now()) {
      backgroundCache.delete(site.backgroundImage);
      backgroundCache.set(site.backgroundImage, cached);
      return sendBackground(reply, cached);
    }
    if (cached) backgroundCache.delete(site.backgroundImage);

    try {
      const response = await services.publicFetcher!(site.backgroundImage, {
        headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8,*/*;q=0.1' },
        maxBytes: MAX_BACKGROUND_BYTES,
        timeoutMs: BACKGROUND_FETCH_TIMEOUT_MS,
      });
      const declaredLength = Number(headerValue(response.headers['content-length']) || 0);
      const contentType = detectBackgroundType(response.body);
      if (
        response.statusCode < 200
        || response.statusCode >= 300
        || declaredLength > MAX_BACKGROUND_BYTES
        || !response.body.length
        || response.body.length > MAX_BACKGROUND_BYTES
        || !contentType
      ) {
        return reply.status(502).send({ code: 502, data: null, message: 'Background image unavailable' });
      }
      if (backgroundCache.size >= MAX_BACKGROUND_CACHE_ENTRIES) {
        const oldest = backgroundCache.keys().next().value;
        if (oldest !== undefined) backgroundCache.delete(oldest);
      }
      const entry = { body: response.body, contentType, expiresAt: Date.now() + BACKGROUND_CACHE_TTL_MS };
      backgroundCache.set(site.backgroundImage, entry);
      return sendBackground(reply, entry);
    } catch {
      return reply.status(502).send({ code: 502, data: null, message: 'Background image unavailable' });
    }
  });

  app.get('/api/navigation/:username', async (request, reply) => {
    const username = (request.params as any).username;
    const site = await findNavigationSite(services, username);
    if (!site) throw Object.assign(new Error('Navigation not found'), { statusCode: 404 });
    const access = await navigationAccess(request, site, services);
    if (!access.unlocked) {
      return sendOk(reply, { site: publicSite(site), folders: [], access });
    }
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
      site: publicSite(site),
      folders: folders.map((folder) => publicFolder(folder, linksByFolder.get(folder.id) || [])),
      access,
    });
  });

  app.post('/api/navigation/:username/links/:id/click', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const site = await findNavigationSite(services, (request.params as any).username);
    if (!site) throw Object.assign(new Error('Navigation not found'), { statusCode: 404 });
    const access = await navigationAccess(request, site, services);
    if (!access.unlocked) throw Object.assign(new Error('Navigation access required'), { statusCode: 403 });
    const recorded = await services.repo.recordLinkClick(site.userId, numericParam(request));
    if (!recorded) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    return reply.status(204).send();
  });

  app.post('/api/navigation/:username/unlock', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const site = await findNavigationSite(services, (request.params as any).username);
    if (!site) throw Object.assign(new Error('Navigation not found'), { statusCode: 404 });
    if (!site.guestAccessEnabled) return sendOk(reply, { unlocked: true });
    if (!site.guestAccessPasswordHash) {
      throw Object.assign(new Error('Guest access password is not configured'), { statusCode: 503 });
    }
    const unlocked = await verifyPassword(String((request.body as any)?.password || ''), site.guestAccessPasswordHash);
    if (!unlocked) return sendOk(reply, { unlocked: false });
    reply.setCookie(
      NAVIGATION_ACCESS_COOKIE,
      createNavigationAccessToken(site.id, site.guestAccessPasswordHash, services.sessionSecret),
      {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 12,
      },
    );
    return sendOk(reply, { unlocked: true });
  });

  app.get('/api/v1/allsiteandlinks/:username', async (request, reply) => {
    const username = (request.params as any).username;
    const site = await services.repo.getSiteBySlug(username);
    if (!site) throw Object.assign(new Error('user not found'), { statusCode: 404 });
    const access = await navigationAccess(request, site, services);
    if (!access.unlocked) {
      return reply.send({
        code: 0,
        data: {
          site_info: legacyPublicSite(site),
          folder_with_links: [],
          target: { id: site.user.id, name: site.user.username },
          me: null,
          access,
        },
        message: '',
      });
    }
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
        site_info: legacyPublicSite(site),
        folder_with_links: folders.map((folder) => publicFolder(folder, linksByFolder.get(folder.id) || [])),
        target: { id: site.user.id, name: site.user.username },
        me: null,
        access,
      },
      message: '',
    });
  });

  app.post('/api/navigation/:username/folder/:id/verify', async (request, reply) => {
    const site = await findNavigationSite(services, (request.params as any).username);
    if (!site) throw Object.assign(new Error('Navigation not found'), { statusCode: 404 });
    const access = await navigationAccess(request, site, services);
    if (!access.unlocked) throw Object.assign(new Error('Navigation access required'), { statusCode: 403 });
    const folder = await services.repo.getFolder(site.userId, numericParam(request));
    if (!folder?.passwordHash) return sendOk(reply, { verified: true });
    const ok = await verifyPassword(String((request.body as any)?.password || ''), folder.passwordHash);
    return sendOk(reply, {
      verified: ok,
      links: ok
        ? (await services.repo.listLinks(site.userId)).filter((link) => link.folderId === folder.id).map(publicLink)
        : [],
    });
  });
}

async function findNavigationSite(services: AppServices, slug: string) {
  const exactSite = await services.repo.getSiteBySlug(slug);
  if (exactSite || slug !== 'admin') return exactSite;

  const users = await services.repo.listUsers();
  const admin = users.find((user) => user.role === 'admin');
  return admin ? services.repo.getSite(admin.id) : null;
}

function publicSite(site: SiteRecord) {
  return {
    id: site.id,
    userId: site.userId,
    name: site.name,
    description: site.description,
    slug: site.slug,
    backgroundImage: site.backgroundImage || null,
    backgroundColor: site.backgroundColor,
    fontColor: site.fontColor,
    searchUrlTemplate: site.searchUrlTemplate,
    localSearchFirst: site.localSearchFirst,
    settings: site.settings,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  };
}

function publicFolder(folder: FolderRecord, links: LinkRecord[]) {
  const locked = Boolean(folder.passwordHash);
  return {
    id: folder.id,
    userId: folder.userId,
    parentId: folder.parentId || null,
    name: folder.name,
    icon: folder.icon || null,
    description: folder.description || null,
    sortOrder: folder.sortOrder,
    passwordHint: folder.passwordHint || null,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    locked,
    links: locked ? [] : links.map(publicLink),
  };
}

async function navigationAccess(request: Parameters<typeof resolveUser>[0], site: SiteRecord, services: AppServices) {
  if (!site.guestAccessEnabled) return { required: false, unlocked: true };
  if (await resolveUser(request, services)) return { required: true, unlocked: true };
  const token = (request.cookies as Record<string, string> | undefined)?.[NAVIGATION_ACCESS_COOKIE];
  return {
    required: true,
    unlocked: Boolean(site.guestAccessPasswordHash && verifyNavigationAccessToken(token, site.id, site.guestAccessPasswordHash, services.sessionSecret)),
  };
}

function legacyPublicSite(site: SiteRecord) {
  return {
    name: site.name,
    info: site.description,
    bg: site.backgroundImage,
    bg_color: site.backgroundColor,
    font_color: site.fontColor,
    search_engine: 'google',
    search_url_template: site.searchUrlTemplate,
    local_search_first: site.localSearchFirst,
  };
}

function publicLink(link: LinkRecord) {
  return {
    id: link.id,
    folderId: link.folderId,
    name: link.name,
    url: link.url,
    icon: link.icon ?? null,
    description: link.description ?? null,
    sortOrder: link.sortOrder,
    clickCount: link.clickCount || 0,
    lastClickedAt: link.lastClickedAt || null,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function sendBackground(reply: FastifyReply, entry: BackgroundCacheEntry) {
  return reply
    .header('cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
    .header('x-content-type-options', 'nosniff')
    .type(entry.contentType)
    .send(entry.body);
}

function detectBackgroundType(body: Buffer) {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
  const signature = body.subarray(0, 12).toString('ascii');
  if (signature.startsWith('GIF87a') || signature.startsWith('GIF89a')) return 'image/gif';
  if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') return 'image/webp';
  if (body.length >= 12 && body.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = body.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return '';
}
