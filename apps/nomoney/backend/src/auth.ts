import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction, Router } from 'express';
import { z } from 'zod';
import type { AppContext } from './types.js';
import { asyncHandler, HttpError, parseBody } from './http.js';
import { toIsoDateTime } from './utils.js';

function cookieName(context: AppContext): string {
  return context.product === 'yumi' ? 'yumi_session' : 'moneypulse_session';
}
const authWindowMs = 15 * 60 * 1000;
const maxAuthAttempts = 8;
const authAttempts = new WeakMap<AppContext, Map<string, { count: number; resetAt: number }>>();
const setupQueues = new WeakMap<AppContext, Promise<void>>();

const setupSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(8),
  email: z.string().email()
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

export function registerAuthRoutes(router: Router, context: AppContext): void {
  router.get('/auth/setup-status', (_req, res) => {
    res.json({ needsSetup: !hasUser(context) });
  });

  router.post(
    '/auth/setup',
    asyncHandler(async (req, res) => {
      const rateKey = authRateKey(req, 'setup');
      assertAuthRateLimit(context, rateKey);
      try {
        const body = parseBody(setupSchema, req.body);
        await withSetupLock(context, async () => {
          if (hasUser(context)) {
            throw new HttpError(409, 'SETUP_ALREADY_DONE', 'Setup has already been completed');
          }

          const now = toIsoDateTime(context.now());
          const passwordHash = await bcrypt.hash(body.password, 10);
          const id = context.db.insert(
            `INSERT INTO users (username, password_hash, email, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [body.username, passwordHash, body.email, now, now]
          );
          const user = getPublicUser(context, id);
          setSessionCookie(res, context, id);
          clearAuthRateLimit(context, rateKey);
          res.status(201).json({ user });
        });
      } catch (error) {
        recordFailedAuthAttempt(context, rateKey);
        throw error;
      }
    })
  );

  router.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const body = parseBody(loginSchema, req.body);
      const rateKey = authRateKey(req, 'login', body.username);
      assertAuthRateLimit(context, rateKey);
      const user = context.db.get<{ id: number; username: string; password_hash: string; email: string }>(
        'SELECT id, username, password_hash, email FROM users WHERE username = ?',
        [body.username]
      );

      if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
        recordFailedAuthAttempt(context, rateKey);
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
      }

      setSessionCookie(res, context, Number(user.id));
      clearAuthRateLimit(context, rateKey);
      res.json({ user: getPublicUser(context, Number(user.id)) });
    })
  );

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(cookieName(context), cookieOptions(context));
    res.status(204).end();
  });

  router.get('/auth/me', requireAuth(context), (req, res) => {
    res.json({ user: getPublicUser(context, Number(res.locals.userId)) });
  });

  router.put(
    '/auth/password',
    requireAuth(context),
    asyncHandler(async (req, res) => {
      const body = parseBody(passwordSchema, req.body);
      const user = context.db.get<{ id: number; password_hash: string }>(
        'SELECT id, password_hash FROM users WHERE id = ?',
        [Number(res.locals.userId)]
      );
      if (!user || !(await bcrypt.compare(body.currentPassword, user.password_hash))) {
        throw new HttpError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
      }

      const passwordHash = await bcrypt.hash(body.newPassword, 10);
      context.db.run('UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?', [
        passwordHash,
        toIsoDateTime(context.now()),
        Number(user.id)
      ]);
      setSessionCookie(res, context, Number(user.id));
      res.status(204).end();
    })
  );
}

async function withSetupLock(context: AppContext, operation: () => Promise<void>): Promise<void> {
  let releaseSetup!: () => void;
  const previousSetup = setupQueues.get(context) || Promise.resolve();
  setupQueues.set(context, new Promise<void>((resolve) => {
    releaseSetup = resolve;
  }));
  await previousSetup;
  try {
    await operation();
  } finally {
    releaseSetup();
  }
}

export function requireAuth(context: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[cookieName(context)];
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    try {
      const payload = jwt.verify(token, context.jwtSecret) as { sub: string; sv?: number };
      const userId = Number(payload.sub);
      const sessionVersion = Number(payload.sv);
      const user = context.db.get<{ session_version: number }>(
        'SELECT session_version FROM users WHERE id = ?',
        [userId]
      );
      if (!user || !Number.isFinite(sessionVersion) || Number(user.session_version) !== sessionVersion) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });
        return;
      }
      res.locals.userId = userId;
      next();
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });
    }
  };
}

function hasUser(context: AppContext): boolean {
  const row = context.db.get<{ count: number }>('SELECT COUNT(*) as count FROM users');
  return Number(row?.count ?? 0) > 0;
}

function getPublicUser(context: AppContext, id: number) {
  const user = context.db.get<{ id: number; username: string; email: string }>(
    'SELECT id, username, email FROM users WHERE id = ?',
    [id]
  );
  if (!user) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
  }
  return { id: Number(user.id), username: String(user.username), email: String(user.email) };
}

function setSessionCookie(res: Response, context: AppContext, userId: number): void {
  const sessionVersion = getSessionVersion(context, userId);
  const token = jwt.sign({ sub: String(userId), sv: sessionVersion }, context.jwtSecret, { expiresIn: '30d' });
  res.cookie(cookieName(context), token, {
    ...cookieOptions(context),
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function cookieOptions(context: AppContext) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: context.cookieSecure,
    path: context.cookiePath
  };
}

function getSessionVersion(context: AppContext, userId: number): number {
  const row = context.db.get<{ session_version: number }>(
    'SELECT session_version FROM users WHERE id = ?',
    [userId]
  );
  return Number(row?.session_version ?? 1);
}

function authRateKey(req: Request, scope: string, username = ''): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${scope}:${ip}:${username.trim().toLowerCase()}`;
}

function rateBuckets(context: AppContext) {
  let buckets = authAttempts.get(context);
  if (!buckets) {
    buckets = new Map();
    authAttempts.set(context, buckets);
  }
  return buckets;
}

function assertAuthRateLimit(context: AppContext, key: string): void {
  const now = Date.now();
  const buckets = rateBuckets(context);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.delete(key);
    return;
  }
  if (bucket.count >= maxAuthAttempts) {
    throw new HttpError(429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts. Please try again later.');
  }
}

function recordFailedAuthAttempt(context: AppContext, key: string): void {
  const now = Date.now();
  const buckets = rateBuckets(context);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + authWindowMs });
    return;
  }
  bucket.count += 1;
}

function clearAuthRateLimit(context: AppContext, key: string): void {
  rateBuckets(context).delete(key);
}
