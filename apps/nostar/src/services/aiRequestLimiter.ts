import { getStorageScope } from './storageScope';

/** Shared admission for requests using the same NoNo user, stored config, and endpoint. */
export interface AIRateLimitConfig {
  maxConcurrency?: number;
  requestsPerMinute?: number;
  rpmWindowMs?: number;
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export function parseRetryAfterMs(headers: Headers): number | undefined {
  const milliseconds = headers.get('retry-after-ms');
  if (milliseconds?.trim()) {
    const value = Number(milliseconds);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const retryAfter = headers.get('retry-after');
  if (!retryAfter?.trim()) return undefined;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined;
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export type AIRequestError = Error & { status?: number; statusCode?: number; retryAfterMs?: number };

export function aiResponseError(response: Response, message: string): AIRequestError {
  return Object.assign(new Error(message), {
    status: response.status,
    statusCode: response.status,
    retryAfterMs: parseRetryAfterMs(response.headers),
  });
}

export class AIRateLimiter {
  private active = 0;
  private timestamps: number[] = [];
  private cooldownUntil = 0;
  private consecutiveRateLimits = 0;
  private maxConcurrency = 3;
  private readonly requestsPerMinute: number;
  private readonly rpmWindowMs: number;

  constructor(config: AIRateLimitConfig = {}) {
    this.setMaxConcurrency(config.maxConcurrency);
    this.requestsPerMinute = Math.max(1, Math.floor(config.requestsPerMinute || 60));
    this.rpmWindowMs = Math.max(1, config.rpmWindowMs || 60_000);
  }

  setMaxConcurrency(maxConcurrency?: number): void {
    this.maxConcurrency = Math.max(1, Math.min(10, Math.floor(maxConcurrency || 3)));
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const now = Date.now();
      this.timestamps = this.timestamps.filter(timestamp => timestamp > now - this.rpmWindowMs);
      const rpmWait = this.timestamps.length >= this.requestsPerMinute
        ? this.timestamps[0] + this.rpmWindowMs - now : 0;
      const wait = Math.max(0, this.cooldownUntil - now, rpmWait);
      // Admission and occupancy are synchronous so concurrent callers cannot take one slot twice.
      if (wait === 0 && this.active < this.maxConcurrency) {
        this.active++;
        this.timestamps.push(now);
        let released = false;
        return () => { if (!released) { released = true; this.active--; } };
      }
      // Known cooldown/RPM waits need one cancellable timer; only a busy slot polls.
      await abortableDelay(Math.min(wait || 100, 2_147_483_647), signal);
    }
  }

  notifySuccess(): void { this.consecutiveRateLimits = 0; }

  notifyRateLimit(retryAfterMs?: number): void {
    const backoff = Math.min(60_000, 1000 * 2 ** Math.min(this.consecutiveRateLimits++, 6));
    const jitteredBackoff = Math.min(60_000, Math.round(backoff * (0.75 + Math.random() * 0.5)));
    const serverWait = typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)
      ? Math.min(MAX_SERVER_RETRY_AFTER_MS, Math.max(0, retryAfterMs)) : 0;
    // Every 429 delays every queued caller; a later success never shortens this cooldown.
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + Math.max(serverWait, jitteredBackoff));
  }
}

// A hostile or misconfigured Retry-After must not freeze AI features for the rest of the session.
const MAX_SERVER_RETRY_AFTER_MS = 5 * 60_000;

const sharedLimiters = new Map<string, AIRateLimiter>();

export function getAIRequestLimiter(config: { id: string; baseUrl: string; concurrency?: number }): AIRateLimiter {
  let endpoint = config.baseUrl.trim().replace(/\/+$/, '');
  try {
    const url = new URL(endpoint);
    url.hash = '';
    endpoint = url.toString().replace(/\/+$/, '');
  } catch { /* URL validation is performed by the request path. */ }
  const key = JSON.stringify([getStorageScope(), config.id, endpoint]);
  let limiter = sharedLimiters.get(key);
  if (!limiter) {
    limiter = new AIRateLimiter({ maxConcurrency: config.concurrency });
    sharedLimiters.set(key, limiter);
  } else {
    // Preserve current occupancy, request history, and provider cooldown when settings change.
    limiter.setMaxConcurrency(config.concurrency);
  }
  return limiter;
}
