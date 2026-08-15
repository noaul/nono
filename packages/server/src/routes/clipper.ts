import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';
import { registerClipRoutes } from './clipper/clip-routes.js';

export async function clipperRoutes(app: FastifyInstance, services: AppServices) {
  registerClipRoutes(app, services);
}
