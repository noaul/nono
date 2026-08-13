import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppServices, AuthUser } from '../types.js';
import { sendError } from './responses.js';
import { hasApiTokenScope, requiredApiTokenScope } from '../utils/api-token-scopes.js';

export async function resolveUser(request: FastifyRequest, services: AppServices): Promise<AuthUser | null> {
  const bearer = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const record = await services.repo.findToken(bearer);
    if (record) {
      (request as any).authTokenScopes = record.scopes;
      return publicAuthUser(record.user);
    }
    return null;
  }
  const token = (request.cookies as Record<string, string> | undefined)?.nono_session;
  if (token) {
    const tracked = await services.repo.findSession(token);
    if (tracked) {
      (request as any).authSessionId = tracked.id;
      if (tracked.lastSeenAt.getTime() < Date.now() - 5 * 60 * 1000) {
        await services.repo.touchSession(tracked.id);
      }
      return publicAuthUser(tracked.user);
    }
  }
  return null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply, services: AppServices) {
  const user = await resolveUser(request, services);
  if (!user) {
    sendError(reply, 401, 'Authentication required');
    return null;
  }
  const tokenScopes = (request as any).authTokenScopes as string[] | undefined;
  if (tokenScopes && !hasApiTokenScope(tokenScopes, requiredApiTokenScope(request))) {
    sendError(reply, 403, 'API token scope is insufficient');
    return null;
  }
  (request as any).user = user;
  return user;
}

export async function requireBrowserSession(request: FastifyRequest, reply: FastifyReply, services: AppServices) {
  const user = await requireAuth(request, reply, services);
  if (!user) return null;
  if (!(request as any).authSessionId || isBearerRequest(request)) {
    sendError(reply, 403, 'A browser session is required');
    return null;
  }
  return user;
}

export function isBearerRequest(request: FastifyRequest) {
  return /^Bearer\s+/i.test(request.headers.authorization || '');
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
