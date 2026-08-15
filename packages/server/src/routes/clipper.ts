import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';
import { registerClipRoutes } from './clipper/clip-routes.js';
import { registerClipHighlightRoutes } from './clipper/highlight-routes.js';
import { registerClipSearchRoutes } from './clipper/search-routes.js';
import { registerClipTagRoutes } from './clipper/tag-routes.js';

export async function clipperRoutes(app: FastifyInstance, services: AppServices) {
  registerClipRoutes(app, services);
  registerClipSearchRoutes(app, services);
  registerClipTagRoutes(app, services);
  registerClipHighlightRoutes(app, services);
}
