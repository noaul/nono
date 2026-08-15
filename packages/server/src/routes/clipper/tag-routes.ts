import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendError, sendOk } from '../../plugins/responses.js';
import { createClipService } from '../../services/clip.service.js';
import { normalizeClipTagName } from '../../services/prisma.repository.js';
import { handleClipError } from './clip-routes.js';

const tagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

const assignSchema = z.object({
  tagIds: z.array(z.number().int().positive()).max(50),
});

export function registerClipTagRoutes(app: FastifyInstance, services: AppServices) {
  const clips = createClipService(services.prisma);
  const prisma = services.prisma;

  app.get('/api/clipper/tags', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    return sendOk(reply, await prisma.clipTag.findMany({
      where: { userId: user.id },
      orderBy: { name: 'asc' },
    }));
  });

  app.post('/api/clipper/tags', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const input = tagSchema.parse(request.body);
    const normalizedName = normalizeClipTagName(input.name);
    if (!normalizedName) return sendError(reply, 400, 'Tag name is empty');

    // Uniqueness is on the normalized name, so "Reading" and "reading" cannot both exist. The
    // display name of an existing tag is left as its owner wrote it.
    const existing = await prisma.clipTag.findFirst({ where: { userId: user.id, normalizedName } });
    if (existing) return sendOk(reply, existing);

    return sendOk(reply, await prisma.clipTag.create({
      data: { userId: user.id, name: input.name, normalizedName, color: input.color || null },
    }));
  });

  app.patch('/api/clipper/tags/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const id = Number((request.params as any).id);
    const input = tagSchema.partial().parse(request.body);
    const current = await prisma.clipTag.findFirst({ where: { id, userId: user.id } });
    if (!current) return sendError(reply, 404, 'Tag not found');

    const normalizedName = input.name ? normalizeClipTagName(input.name) : null;
    if (normalizedName) {
      const existing = await prisma.clipTag.findFirst({ where: { userId: user.id, normalizedName } });
      if (existing && existing.id !== id) return sendError(reply, 409, 'Tag name already exists');
    }

    let updated;
    try {
      updated = await prisma.clipTag.updateMany({
        where: { id, userId: user.id },
        data: {
          ...(input.name ? { name: input.name, normalizedName } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
        },
      });
    } catch (error) {
      if (isPrismaUniqueConflict(error)) return sendError(reply, 409, 'Tag name already exists');
      throw error;
    }
    if (!updated.count) return sendError(reply, 404, 'Tag not found');
    return sendOk(reply, await prisma.clipTag.findFirst({ where: { id, userId: user.id } }));
  });

  app.delete('/api/clipper/tags/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const removed = await prisma.clipTag.deleteMany({
      where: { id: Number((request.params as any).id), userId: user.id },
    });
    if (!removed.count) return sendError(reply, 404, 'Tag not found');
    return sendOk(reply, { ok: true });
  });

  app.put('/api/clipper/clips/:id/tags', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const input = assignSchema.parse(request.body);
    try {
      const assigned = await clips.assignTags(user.id, Number((request.params as any).id), input.tagIds);
      return sendOk(reply, { assigned });
    } catch (error) {
      return handleClipError(reply, error);
    }
  });
}

function isPrismaUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
