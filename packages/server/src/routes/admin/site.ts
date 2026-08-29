import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAuth, requireBrowserSession } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { siteUpdateSchema } from '../../utils/site-settings.js';
import { setAuditContext } from '../../plugins/audit.js';
import { hashPassword } from '../../utils/crypto.js';

export async function siteRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/site', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const site = await services.repo.getSite(user.id);
    return sendOk(reply, site ? publicAdminSite(site) : null);
  });

  app.put('/api/admin/site', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const input = siteUpdateSchema.parse(request.body);
    const current = await services.repo.getSite(user.id);
    const before = current ? siteAuditSnapshot(current) : null;
    const { guestAccessPassword, ...siteInput } = input;
    const guestAccessPasswordHash = guestAccessPassword
      ? await hashPassword(guestAccessPassword)
      : current?.guestAccessPasswordHash;
    if (siteInput.guestAccessEnabled && !guestAccessPasswordHash) {
      throw Object.assign(new Error('Set a guest access password before enabling protection'), { statusCode: 400 });
    }
    const updated = await services.repo.updateSite(user.id, {
      ...siteInput,
      ...(guestAccessPassword ? { guestAccessPasswordHash } : {}),
    });
    setAuditContext(request, {
      action: 'update',
      resourceType: 'site',
      resourceId: updated.id,
      resourceLabel: updated.name,
      details: { before, after: siteAuditSnapshot(updated) },
    });
    return sendOk(reply, publicAdminSite(updated));
  });
}

function publicAdminSite(site: NonNullable<Awaited<ReturnType<AppServices['repo']['getSite']>>>) {
  const { guestAccessPasswordHash, ...publicSite } = site;
  return { ...publicSite, guestAccessPasswordSet: Boolean(guestAccessPasswordHash) };
}

function siteAuditSnapshot(site: Awaited<ReturnType<AppServices['repo']['getSite']>> & {}) {
  return {
    id: site.id,
    name: site.name,
    description: site.description,
    slug: site.slug,
    backgroundImage: site.backgroundImage || null,
    backgroundColor: site.backgroundColor,
    fontColor: site.fontColor,
    searchUrlTemplate: site.searchUrlTemplate,
    localSearchFirst: site.localSearchFirst,
    guestAccessEnabled: site.guestAccessEnabled,
    guestAccessPasswordSet: Boolean(site.guestAccessPasswordHash),
    settings: site.settings,
  };
}
