import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../types.js';
import { sendOk } from '../plugins/responses.js';
import { resolveUser } from '../plugins/auth.js';
import { assertStrongPassword, loginUser, registerUser, setupAdmin } from '../services/auth.service.js';
import { publicUser, type UserRecord } from '../services/repository.js';
import { clearBrowserSession, currentSessionId, issueBrowserSession } from '../services/session.service.js';

const authSchema = z.object({
  username: z.string().trim().min(2).max(40),
  email: z.string().email().optional(),
  displayName: z.string().trim().max(80).optional(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/auth/setup', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = authSchema.parse(request.body);
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

  app.get('/api/auth/session', async (request, reply) => {
    const user = await resolveUser(request, services);
    const users = await services.repo.listUsers();
    return sendOk(reply, { authenticated: Boolean(user), setupRequired: !users.some((item) => item.role === 'admin' && item.passwordHash), user });
  });
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
