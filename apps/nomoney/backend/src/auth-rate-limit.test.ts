import { describe, expect, test } from './test-utils.js';
import { maxAuthAttempts, maxAuthRateKeys, pruneAuthRateLimit, type AuthAttempt } from './auth.js';

/**
 * The login rate limiter keys buckets per (ip, username), and a bucket is otherwise only dropped
 * when that exact key is revisited after lapsing. Without pruning, an attacker cycling usernames
 * grows the map for as long as the process lives.
 */
function buckets(entries: Array<[string, AuthAttempt]>) {
  return new Map<string, AuthAttempt>(entries);
}

describe('auth rate limit pruning', () => {
  test('drops lapsed buckets once the map reaches its cap', () => {
    const now = 1_000_000;
    const map = buckets([
      ...Array.from({ length: maxAuthRateKeys - 1 }, (_, index) => (
        [`login:1.2.3.4:stale-${index}`, { count: 1, resetAt: now - 1 }] as [string, AuthAttempt]
      )),
      ['login:1.2.3.4:live', { count: 3, resetAt: now + 60_000 }],
    ]);

    pruneAuthRateLimit(map, now);

    expect(map.size).toBe(1);
    expect(map.get('login:1.2.3.4:live')).toEqual({ count: 3, resetAt: now + 60_000 });
  });

  test('leaves the map alone while it is below the cap', () => {
    const now = 1_000_000;
    const map = buckets([['login:1.2.3.4:stale', { count: 1, resetAt: now - 1 }]]);

    pruneAuthRateLimit(map, now);

    expect(map.size).toBe(1);
  });

  test('sheds the least-active buckets so a flood cannot clear an existing lockout', () => {
    // Nothing has lapsed, so the batch shed is the only way back under the cap. The victim's
    // bucket is the oldest one here, so an expiry-ordered shed would drop exactly the entry an
    // attacker wants gone. Its attempt count is what has to keep it alive.
    const now = 1_000_000;
    const map = buckets([
      ['login:9.9.9.9:victim', { count: maxAuthAttempts, resetAt: now + 1_000 }],
      ...Array.from({ length: maxAuthRateKeys - 1 }, (_, index) => (
        [`login:1.2.3.4:flood-${index}`, { count: 1, resetAt: now + 2_000 + index }] as [string, AuthAttempt]
      )),
    ]);

    pruneAuthRateLimit(map, now);

    expect(map.size).toBeLessThan(maxAuthRateKeys);
    expect(map.has('login:9.9.9.9:victim')).toBe(true);
  });
});
