import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import type { ApiTokenRecord } from '../../services/repository.js';

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

  app.get('/api/admin/tokens/summary', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, summarizeTokens(await services.repo.listTokens(user.id)));
  });

  app.post('/api/admin/tokens', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = tokenSchema.parse(request.body);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    assertFutureExpiry(expiresAt);
    const token = await services.repo.createToken(user.id, input.name, expiresAt);
    return sendOk(reply, token);
  });

  app.delete('/api/admin/tokens/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    await services.repo.deleteToken(user.id, Number((request.params as any).id));
    return sendOk(reply, { ok: true });
  });
}

function assertFutureExpiry(expiresAt: Date | null) {
  if (expiresAt && expiresAt.getTime() <= Date.now()) throw Object.assign(new Error('Token expiry must be in the future'), { statusCode: 400 });
}

function summarizeTokens(tokens: ApiTokenRecord[]) {
  const now = Date.now();
  const soon = now + 7 * 24 * 60 * 60 * 1000;
  return tokens.reduce(
    (summary, token) => {
      const expiresAt = token.expiresAt?.getTime();
      const expired = Boolean(expiresAt && expiresAt <= now);
      summary.total += 1;
      if (expired) summary.expired += 1;
      else summary.active += 1;
      if (!expiresAt) summary.neverExpires += 1;
      if (expiresAt && expiresAt > now && expiresAt <= soon) summary.expiringSoon += 1;
      return summary;
    },
    { total: 0, active: 0, expired: 0, neverExpires: 0, expiringSoon: 0 },
  );
}
