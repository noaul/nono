import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../types.js';
import { sendOk } from '../plugins/responses.js';
import { resolveUser } from '../plugins/auth.js';
import { assertStrongPassword, loginUser, registerUser, setupAdmin } from '../services/auth.service.js';
import { publicUser } from '../services/repository.js';

const authSchema = z.object({
  username: z.string().trim().min(2).max(40),
  email: z.string().email().optional(),
  displayName: z.string().trim().max(80).optional(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/auth/setup', async (request, reply) => {
    const input = authSchema.parse(request.body);
    assertStrongPassword(input.password);
    const user = await setupAdmin(services.repo, input as any);
    const { token } = await loginUser(services.repo, { username: user.username, password: input.password }, services.sessionSecret);
    reply.setCookie('nono_session', token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 14 });
    return sendOk(reply, { user: publicUser(user) });
  });

  app.post('/api/auth/register', async (request, reply) => {
    const config = await services.repo.getConfig();
    if (!config.allowRegistration) throw Object.assign(new Error('Registration is closed'), { statusCode: 403 });
    const input = authSchema.required({ email: true }).parse(request.body);
    assertStrongPassword(input.password);
    const user = await registerUser(services.repo, input as any, config.defaultRole);
    return sendOk(reply, { user: publicUser(user) });
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = authSchema.pick({ username: true, password: true }).parse(request.body);
    const { user, token } = await loginUser(services.repo, input, services.sessionSecret);
    reply.setCookie('nono_session', token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 14 });
    return sendOk(reply, { user: publicUser(user) });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('nono_session', { path: '/' });
    return sendOk(reply, { ok: true });
  });

  app.get('/api/auth/session', async (request, reply) => {
    const user = await resolveUser(request, services);
    const users = await services.repo.listUsers();
    return sendOk(reply, { authenticated: Boolean(user), setupRequired: !users.some((item) => item.role === 'admin' && item.passwordHash), user });
  });
}
