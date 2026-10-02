import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction, Router } from 'express';
import type { AppContext, SessionUser, SessionVerifier } from './types.js';

/**
 * NoMoney and Yumi have no accounts of their own: every request is authorised by the NoNo browser
 * session that the gateway forwards on the same origin. The products hold one owner's data, so only
 * a NoNo administrator may use them.
 */
export const nonoSessionCookie = 'nono_session';

export function registerAuthRoutes(router: Router, context: AppContext): void {
  router.get('/auth/me', requireAuth(context), (_req, res) => {
    res.json({ user: res.locals.user });
  });
}

export function requireAuth(context: AppContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[nonoSessionCookie];
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    let user: SessionUser | null;
    try {
      user = await context.verifySession(String(token));
    } catch {
      res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'NoNo session service is unavailable' } });
      return;
    }
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });
      return;
    }
    if (user.role !== 'admin') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Administrator permission required' } });
      return;
    }
    res.locals.userId = user.id;
    res.locals.user = user;
    next();
  };
}

interface NonoSessionVerifierOptions {
  /** Base URL of NoNo's internal listener, e.g. http://127.0.0.1:3001. */
  baseUrl: string;
  internalToken: string;
  fetch?: typeof fetch;
  ttlMs?: number;
  now?: () => number;
}

const maxCachedSessions = 1_000;

/**
 * Asks NoNo who owns a session cookie. Answers are cached briefly by cookie hash so a page load that
 * fires a dozen API calls costs one round trip; a logout therefore takes effect within `ttlMs`.
 */
export function createNonoSessionVerifier(options: NonoSessionVerifierOptions): SessionVerifier {
  const fetcher = options.fetch ?? fetch;
  const ttlMs = options.ttlMs ?? 30_000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { user: SessionUser | null; expiresAt: number }>();

  return async (token) => {
    const key = createHash('sha256').update(token).digest('hex');
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.user;

    const response = await fetcher(`${options.baseUrl}/api/internal/auth/session`, {
      headers: {
        cookie: `${nonoSessionCookie}=${token}`,
        'x-nono-internal-token': options.internalToken
      },
      redirect: 'error',
      signal: AbortSignal.timeout(3_000)
    });
    let user: SessionUser | null = null;
    if (response.ok) {
      const body = await response.json() as { data?: { user?: SessionUser } };
      const candidate = body.data?.user;
      if (candidate && Number.isInteger(candidate.id)) {
        user = { id: candidate.id, username: String(candidate.username), role: candidate.role === 'admin' ? 'admin' : 'user' };
      }
    } else if (response.status !== 401) {
      throw new Error(`NoNo session check failed with HTTP ${response.status}`);
    }

    if (cache.size >= maxCachedSessions) {
      for (const [cachedKey, entry] of cache) if (entry.expiresAt <= now()) cache.delete(cachedKey);
      if (cache.size >= maxCachedSessions) cache.clear();
    }
    cache.set(key, { user, expiresAt: now() + ttlMs });
    return user;
  };
}
