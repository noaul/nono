import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Repository } from './repository.js';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export async function issueBrowserSession(repo: Repository, userId: number, request: FastifyRequest, reply: FastifyReply) {
  const session = await repo.createSession(userId, {
    userAgent: request.headers['user-agent']?.slice(0, 500) || null,
    ipAddress: request.ip?.slice(0, 80) || null,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });
  reply.setCookie('nono_session', session.token, sessionCookieOptions());
  (request as any).authSessionId = session.id;
  return session;
}

export function clearBrowserSession(reply: FastifyReply) {
  reply.clearCookie('nono_session', { path: '/' });
}

export function currentSessionId(request: FastifyRequest) {
  const value = (request as any).authSessionId;
  return typeof value === 'string' ? value : null;
}

function sessionCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
