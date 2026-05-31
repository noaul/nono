import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';

export async function siteRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/site', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await services.repo.getSite(user.id));
  });

  app.put('/api/admin/site', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await services.repo.updateSite(user.id, request.body as any));
  });
}
