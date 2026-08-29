import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendError, sendOk } from '../../plugins/responses.js';
import { createClipService } from '../../services/clip.service.js';
import { createClipRefetch } from '../../services/clip-refetch.js';
import { handleClipError } from './clip-routes.js';
import { numericParam } from '../../utils/route-params.js';
import { currentSessionId } from '../../services/session.service.js';

/**
 * The anchor carries the quote plus its surrounding context, not just offsets. Offsets alone stop
 * meaning anything the moment a refetch rewrites the body, and would silently attach the highlight
 * to whatever text now sits at that position.
 */
const highlightSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  note: z.string().max(2000).optional().nullable(),
  color: z.enum(['yellow', 'green', 'blue', 'pink', 'purple']).optional(),
  anchor: z.object({
    quote: z.string().min(1).max(10_000),
    prefix: z.string().max(200).optional(),
    suffix: z.string().max(200).optional(),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
  }),
});

export function registerClipHighlightRoutes(app: FastifyInstance, services: AppServices) {
  const clips = createClipService(services.prisma);
  const refetch = createClipRefetch({
    prisma: services.prisma,
    safeRequester: services.safeRequester,
    privateOutboundHosts: services.privateOutboundHosts,
  });

  app.post('/api/clipper/clips/:id/highlights', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const input = highlightSchema.parse(request.body);
    try {
      const highlight = await clips.addHighlight(user.id, numericParam(request), input);
      return sendOk(reply, highlight);
    } catch (error) {
      return handleClipError(reply, error);
    }
  });

  app.delete('/api/clipper/highlights/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const removed = await clips.removeHighlight(user.id, numericParam(request));
    if (!removed) return sendError(reply, 404, 'Highlight not found');
    return sendOk(reply, { ok: true });
  });

  // Refetch reaches out to a user-supplied URL on the server's behalf, so it is rate limited on top
  // of the address checks inside the safe requester.
  app.post(
    '/api/clipper/clips/:id/refetch',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const user = await requireAuth(request, reply, services);
      if (!user) return;

      try {
        const clip = await refetch(user, numericParam(request), Boolean(currentSessionId(request)));
        if (!clip) return sendError(reply, 404, 'Clip not found');
        const { contentHtml, contentMd, sourceMeta, ...rest } = clip as Record<string, any>;
        return sendOk(reply, rest);
      } catch (error) {
        return handleClipError(reply, error);
      }
    },
  );
}
