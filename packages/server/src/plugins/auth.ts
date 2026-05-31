import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppServices, AuthUser } from '../types.js';
import { sendError } from './responses.js';
import { verifySessionToken } from '../utils/crypto.js';

export async function resolveUser(request: FastifyRequest, services: AppServices): Promise<AuthUser | null> {
  const bearer = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const record = await services.repo.findToken(bearer);
    return record ? publicAuthUser(record.user) : null;
  }
  const token = (request.cookies as Record<string, string> | undefined)?.nono_session;
  const session = verifySessionToken(token, services.sessionSecret);
  if (!session) return null;
  const user = await services.repo.findUserById(Number(session.uid));
  return user ? publicAuthUser(user) : null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply, services: AppServices) {
  const user = await resolveUser(request, services);
  if (!user) {
    sendError(reply, 401, 'Authentication required');
    return null;
  }
  (request as any).user = user;
  return user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply, services: AppServices) {
  const user = await requireAuth(request, reply, services);
  if (!user) return null;
  if (user.role !== 'admin') {
    sendError(reply, 403, 'Admin permission required');
    return null;
  }
  return user;
}

function publicAuthUser(user: any): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}
