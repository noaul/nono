import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';
import { registerNoStarConfigRoutes } from './nostar/config-routes.js';
import { registerNoStarProxyRoutes } from './nostar/proxy-routes.js';
import { registerNoStarRepositoryRoutes } from './nostar/repository-routes.js';
import { registerNoStarSettingsRoutes } from './nostar/settings-routes.js';
import { registerNoStarSyncRoutes } from './nostar/sync-routes.js';

export async function nostarRoutes(app: FastifyInstance, services: AppServices) {
  registerNoStarSettingsRoutes(app, services);
  registerNoStarRepositoryRoutes(app, services);
  registerNoStarConfigRoutes(app, services);
  registerNoStarSyncRoutes(app, services);
  registerNoStarProxyRoutes(app, services);
}
