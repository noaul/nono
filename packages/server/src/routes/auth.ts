import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../types.js';
import { sendError, sendOk } from '../plugins/responses.js';
import { isBearerRequest, requireInternalToken, resolveUser, tokensMatch } from '../plugins/auth.js';
import { assertStrongPassword, loginUser, registerUser, setupAdmin } from '../services/auth.service.js';
import { publicUser, type UserRecord } from '../services/repository.js';
import { clearBrowserSession, currentSessionId, issueBrowserSession } from '../services/session.service.js';

const authSchema = z.object({
  username: z.string().trim().min(2).max(40),
  email: z.string().email().optional(),
  displayName: z.string().trim().max(80).optional(),
  password: z.string().min(1),
  bootstrapToken: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/auth/setup', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = authSchema.parse(request.body);
    assertBootstrapToken(services.bootstrapToken, input.bootstrapToken);
    assertStrongPassword(input.password);
    const user = await setupAdmin(services.repo, input as any);
    await issueBrowserSession(services.repo, user.id, request, reply);
    await recordUserCreation(services, request, user, 'setup');
    return sendOk(reply, { user: publicUser(user) });
  });

  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const config = await services.repo.getConfig();
    if (!config.allowRegistration) throw Object.assign(new Error('Registration is closed'), { statusCode: 403 });
    const input = authSchema.required({ email: true }).parse(request.body);
    assertStrongPassword(input.password);
    // Self-registration is never an administrator grant. Promotion remains an authenticated
    // action in the user-management screen even if an old database still stores defaultRole=admin.
    const user = await registerUser(services.repo, input as any, 'user');
    await recordUserCreation(services, request, user, 'registration');
    return sendOk(reply, { user: publicUser(user) });
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = authSchema.pick({ username: true, password: true }).parse(request.body);
    const { user } = await loginUser(services.repo, input);
    await issueBrowserSession(services.repo, user.id, request, reply);
    return sendOk(reply, { user: publicUser(user) });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const user = await resolveUser(request, services);
    const sessionId = currentSessionId(request);
    if (user && sessionId) await services.repo.deleteSession(user.id, sessionId);
    clearBrowserSession(reply);
    return sendOk(reply, { ok: true });
  });

  // NoMoney and Yumi have no accounts; they forward the browser's NoNo cookie here to learn who
  // is signed in. Only the cookie counts: an API token must not unlock the products.
  app.get('/api/internal/auth/session', async (request, reply) => {
    if (!requireInternalToken(request, reply, services)) return;
    if (isBearerRequest(request)) return sendError(reply, 401, 'A browser session is required');
    const user = await resolveUser(request, services);
    if (!user) return sendError(reply, 401, 'Authentication required');
    return sendOk(reply, { user });
  });

  app.get('/api/auth/session', async (request, reply) => {
    const user = await resolveUser(request, services);
    const config = await services.repo.getConfig();
    return sendOk(reply, { authenticated: Boolean(user), setupRequired: !config.initializedAt, user });
  });
}

function assertBootstrapToken(expected: string, supplied: string | undefined) {
  if (!expected) return;
  if (!tokensMatch(expected, supplied)) {
    throw Object.assign(new Error('Invalid bootstrap token'), { statusCode: 403 });
  }
}


async function recordUserCreation(services: AppServices, request: FastifyRequest, user: UserRecord, source: 'setup' | 'registration') {
  try {
    await services.auditLogService.record({
      actorUserId: user.id,
      actorUsername: user.username,
      actorRole: user.role,
      action: 'create',
      resourceType: 'user',
      resourceId: String(user.id),
      resourceLabel: user.username,
      result: 'success',
      statusCode: 200,
      ipAddress: request.ip || null,
      userAgent: String(request.headers['user-agent'] || '').slice(0, 500) || null,
      details: { source, after: publicUser(user) },
    });
  } catch (error) {
    request.log.error({ err: error }, 'failed to persist user creation audit log');
  }
}
