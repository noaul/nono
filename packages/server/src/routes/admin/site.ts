import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { siteUpdateSchema } from '../../utils/site-settings.js';
import { setAuditContext } from '../../plugins/audit.js';

export async function siteRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/site', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await services.repo.getSite(user.id));
  });

  app.put('/api/admin/site', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = siteUpdateSchema.parse(request.body);
    const current = await services.repo.getSite(user.id);
    const before = current ? siteAuditSnapshot(current) : null;
    const updated = await services.repo.updateSite(user.id, input);
    setAuditContext(request, {
      action: 'update',
      resourceType: 'site',
      resourceId: updated.id,
      resourceLabel: updated.name,
      details: { before, after: siteAuditSnapshot(updated) },
    });
    return sendOk(reply, updated);
  });
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
    settings: site.settings,
  };
}
