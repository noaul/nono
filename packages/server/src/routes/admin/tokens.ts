import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';

const tokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function tokenRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/tokens', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const tokens = await services.repo.listTokens(user.id);
    return sendOk(
      reply,
      tokens.map((token) => ({
        ...token,
        token: `${token.token.slice(0, 10)}...`,
      })),
    );
  });

  app.post('/api/admin/tokens', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = tokenSchema.parse(request.body);
    const token = await services.repo.createToken(user.id, input.name, input.expiresAt ? new Date(input.expiresAt) : null);
    return sendOk(reply, token);
  });

  app.delete('/api/admin/tokens/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    await services.repo.deleteToken(user.id, Number((request.params as any).id));
    return sendOk(reply, { ok: true });
  });
}
