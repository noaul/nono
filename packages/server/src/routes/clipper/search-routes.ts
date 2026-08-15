import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { MAX_CLIP_SEARCH_QUERY_LENGTH, createClipSearch } from '../../services/clip-search.js';

const searchSchema = z.object({
  q: z.string().max(MAX_CLIP_SEARCH_QUERY_LENGTH * 2).optional().default(''),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export function registerClipSearchRoutes(app: FastifyInstance, services: AppServices) {
  const search = createClipSearch(services.prisma);

  app.get('/api/clipper/search', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const query = searchSchema.parse(request.query);
    return sendOk(reply, await search(user.id, query.q, { limit: query.limit, offset: query.offset }));
  });
}
