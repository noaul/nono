import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireBrowserSession } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import type { ApiTokenRecord } from '../../services/repository.js';
import { setAuditContext } from '../../plugins/audit.js';
import { API_TOKEN_SCOPES, DEFAULT_API_TOKEN_SCOPES } from '../../utils/api-token-scopes.js';

const tokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresAt: z.string().datetime().optional().nullable(),
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1).max(API_TOKEN_SCOPES.length).optional(),
});

const scopeUpdateSchema = z.object({
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1).max(API_TOKEN_SCOPES.length),
});

export async function tokenRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/tokens', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const tokens = await services.repo.listTokens(user.id);
    return sendOk(
      reply,
      tokens.map(publicToken),
    );
  });

  app.get('/api/admin/tokens/summary', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    return sendOk(reply, summarizeTokens(await services.repo.listTokens(user.id)));
  });

  app.get('/api/admin/tokens/current', async (request, reply) => {
    const bearer = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) throw Object.assign(new Error('Bearer token is required'), { statusCode: 401 });
    const record = await services.repo.findToken(bearer);
    if (!record) throw Object.assign(new Error('Token is invalid or expired'), { statusCode: 401 });
    return sendOk(reply, {
      id: record.id,
      name: record.name,
      token: `${record.tokenPrefix}...`,
      scopes: record.scopes,
      expiresAt: record.expiresAt || null,
      createdAt: record.createdAt,
      user: { id: record.user.id, username: record.user.username, displayName: record.user.displayName, role: record.user.role },
    });
  });

  app.post('/api/admin/tokens', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const input = tokenSchema.parse(request.body);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    assertFutureExpiry(expiresAt);
    const scopes = input.scopes || DEFAULT_API_TOKEN_SCOPES;
    const token = await services.repo.createToken(user.id, input.name, expiresAt, scopes);
    setAuditContext(request, {
      action: 'create',
      resourceType: 'token',
      resourceId: token.id,
      resourceLabel: token.name,
      details: { after: { id: token.id, name: token.name, scopes: token.scopes, expiresAt: token.expiresAt || null, createdAt: token.createdAt } },
    });
    return sendOk(reply, {
      id: token.id,
      name: token.name,
      token: token.token,
      scopes: token.scopes,
      expiresAt: token.expiresAt || null,
      createdAt: token.createdAt,
    });
  });

  /**
   * Browser session only. A bearer caller must not be able to widen its own scopes, which is
   * exactly what this endpoint would allow if `requireAuth` were used here.
   */
  app.patch('/api/admin/tokens/:id', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const id = Number((request.params as any).id);
    const input = scopeUpdateSchema.parse(request.body);
    const before = (await services.repo.listTokens(user.id)).find((token) => token.id === id);
    const updated = await services.repo.updateTokenScopes(user.id, id, input.scopes);
    if (!updated) throw Object.assign(new Error('Token not found'), { statusCode: 404 });
    setAuditContext(request, {
      action: 'update',
      resourceType: 'token',
      resourceId: id,
      resourceLabel: updated.name,
      details: { before: { scopes: before?.scopes || [] }, after: { scopes: updated.scopes } },
    });
    return sendOk(reply, publicToken(updated));
  });

  app.delete('/api/admin/tokens/:id', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const id = Number((request.params as any).id);
    const current = (await services.repo.listTokens(user.id)).find((token) => token.id === id);
    await services.repo.deleteToken(user.id, id);
    setAuditContext(request, {
      action: 'delete',
      resourceType: 'token',
      resourceId: id,
      resourceLabel: current?.name || null,
      details: { before: current ? { id: current.id, name: current.name, expiresAt: current.expiresAt || null, createdAt: current.createdAt } : null },
    });
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

function publicToken(token: ApiTokenRecord) {
  return {
    id: token.id,
    name: token.name,
    token: `${token.tokenPrefix}...`,
    scopes: token.scopes,
    expiresAt: token.expiresAt || null,
    createdAt: token.createdAt,
  };
}
