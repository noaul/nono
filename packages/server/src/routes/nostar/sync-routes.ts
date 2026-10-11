import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { PROXY_SETTING_KEY, RPC_SETTING_KEY, asRecord, authed, browserAuthed } from './common.js';
import { exportNoStarData, importNoStarData } from './sync-service.js';

export function registerNoStarSyncRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/nostar/sync/export', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    return exportNoStarData(services, user.id);
  });

  app.post('/api/nostar/sync/import', { bodyLimit: 64 * 1024 * 1024 }, async (request, reply) => {
    const user = await browserAuthed(request, reply, services);
    if (!user) return;
    const data = asRecord(request.body);
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'Invalid data format', code: 'INVALID_DATA_FORMAT' });
    }
    // Same rule as PUT /api/nostar/settings: server network settings are administrator-only.
    const settings = asRecord(data.settings);
    if (user.role !== 'admin' && [PROXY_SETTING_KEY, RPC_SETTING_KEY].some((key) => key in settings)) {
      return reply.status(403).send({ error: 'Administrator access required', code: 'ADMIN_REQUIRED' });
    }
    return { imported: await importNoStarData(services, user.id, data) };
  });
}
