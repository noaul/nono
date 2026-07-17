import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { asRecord, authed } from './common.js';
import { exportNoStarData, importNoStarData } from './sync-service.js';

export function registerNoStarSyncRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/nostar/sync/export', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    return exportNoStarData(services, user.id);
  });

  app.post('/api/nostar/sync/import', { bodyLimit: 64 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const data = asRecord(request.body);
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'Invalid data format', code: 'INVALID_DATA_FORMAT' });
    }
    return { imported: await importNoStarData(services, user.id, data) };
  });
}
