import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendError, sendOk } from '../../plugins/responses.js';
import { setAuditContext } from '../../plugins/audit.js';
import { CLIP_INGEST_BODY_LIMIT, ClipValidationError } from '../../services/clip-content.js';
import { CLIP_STATUSES, createClipService } from '../../services/clip.service.js';

const ingestSchema = z.object({
  url: z.string().url(),
  canonicalUrl: z.string().url().optional().nullable(),
  title: z.string().trim().min(1).max(500),
  author: z.string().max(200).optional().nullable(),
  siteName: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  contentHtml: z.string(),
  contentMd: z.string(),
  contentTruncated: z.boolean().optional(),
  wordCount: z.number().int().nonnegative().optional(),
  lang: z.string().max(35).optional().nullable(),
  favicon: z.string().max(2000).optional().nullable(),
  image: z.string().max(2000).optional().nullable(),
  publishedAt: z.string().optional().nullable(),
  extractor: z.string().max(40),
  sourceMeta: z.unknown().optional(),
  linkId: z.number().int().positive().optional().nullable(),
});

const listSchema = z.object({
  status: z.enum(CLIP_STATUSES).optional(),
  starred: z.enum(['true', 'false']).optional(),
  domain: z.string().max(255).optional(),
  tagId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const patchSchema = z.object({
  status: z.enum(CLIP_STATUSES).optional(),
  starred: z.boolean().optional(),
  title: z.string().trim().min(1).max(500).optional(),
  linkId: z.number().int().positive().nullable().optional(),
});

export function registerClipRoutes(app: FastifyInstance, services: AppServices) {
  const clips = createClipService(services.prisma);

  app.post(
    '/api/clipper/clips',
    // Fastify defaults to a 1 MiB body. A full article with images referenced inline routinely
    // exceeds that, so the ingest route carries its own limit.
    { bodyLimit: CLIP_INGEST_BODY_LIMIT },
    async (request, reply) => {
      const user = await requireAuth(request, reply, services);
      if (!user) return;

      const input = ingestSchema.parse(request.body);
      try {
        const clip = await clips.upsert(user.id, input);
        setAuditContext(request, {
          action: 'create',
          resourceType: 'clip',
          resourceId: clip.id,
          resourceLabel: clip.title,
        });
        return sendOk(reply, publicClip(clip));
      } catch (error) {
        return handleClipError(reply, error);
      }
    },
  );

  app.get('/api/clipper/clips', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const query = listSchema.parse(request.query);
    const result = await clips.list(user.id, {
      ...query,
      starred: query.starred === undefined ? undefined : query.starred === 'true',
    });
    return sendOk(reply, result);
  });

  app.get('/api/clipper/clips/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const clip = await clips.get(user.id, Number((request.params as any).id));
    // 404 rather than 403: a clip owned by someone else must not be distinguishable from one that
    // does not exist.
    if (!clip) return sendError(reply, 404, 'Clip not found');
    return sendOk(reply, clip);
  });

  app.patch('/api/clipper/clips/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const id = Number((request.params as any).id);
    const patch = patchSchema.parse(request.body);
    try {
      const clip = await clips.update(user.id, id, patch);
      if (!clip) return sendError(reply, 404, 'Clip not found');
      setAuditContext(request, {
        action: 'update',
        resourceType: 'clip',
        resourceId: id,
        resourceLabel: clip.title,
      });
      return sendOk(reply, publicClip(clip));
    } catch (error) {
      return handleClipError(reply, error);
    }
  });

  app.delete('/api/clipper/clips/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const id = Number((request.params as any).id);
    const removed = await clips.removeToTrash(user.id, id);
    if (!removed) return sendError(reply, 404, 'Clip not found');
    setAuditContext(request, { action: 'delete', resourceType: 'clip', resourceId: id });
    return sendOk(reply, { ok: true });
  });
}

export function handleClipError(reply: Parameters<typeof sendError>[0], error: unknown) {
  if (error instanceof ClipValidationError) {
    return sendError(reply, 400, error.message);
  }
  throw error;
}

/** Strips article bodies from write responses; the reader fetches them through the detail route. */
function publicClip(clip: Record<string, any>) {
  const { contentHtml, contentMd, sourceMeta, ...rest } = clip;
  return rest;
}
