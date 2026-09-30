import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIRateLimiter, getAIRequestLimiter } from './aiRequestLimiter';

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
describe('AI request limiter cooldown bounds', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it('bounds the jittered cooldown to one minute during persistent rate limiting', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const limiter = new AIRateLimiter();
    for (let i = 0; i < 8; i++) limiter.notifyRateLimit();
    let admitted = false;
    const pending = limiter.acquire().then(release => { admitted = true; release(); });
    await flush();
    expect(admitted).toBe(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(admitted).toBe(true);
    await pending;
  });
  it('honors a provider Retry-After longer than the local one-minute backoff cap', async () => {
    vi.useFakeTimers();
    const limiter = new AIRateLimiter();
    limiter.notifyRateLimit(120000);
    let admitted = false;
    const pending = limiter.acquire().then(release => { admitted = true; release(); });
    await vi.advanceTimersByTimeAsync(119999);
    expect(admitted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(admitted).toBe(true);
    await pending;
  });

  it('lowers concurrency on the existing config while preserving active requests', async () => {
    vi.useFakeTimers();
    const config = { id: 'changed-concurrency', baseUrl: 'https://ai.example/v1', concurrency: 3 };
    const original = getAIRequestLimiter(config);
    const releases = [await original.acquire(), await original.acquire(), await original.acquire()];
    const updated = getAIRequestLimiter({ ...config, concurrency: 1 });
    let admitted = false;
    const pending = updated.acquire().then(release => { admitted = true; release(); });
    await flush();
    expect(admitted).toBe(false);
    releases[0]();
    releases[1]();
    await vi.advanceTimersByTimeAsync(100);
    expect(admitted).toBe(false);
    releases[2]();
    await vi.advanceTimersByTimeAsync(100);
    expect(admitted).toBe(true);
    await pending;
  });

  it('preserves cooldown when the config concurrency changes', async () => {
    vi.useFakeTimers();
    const config = { id: 'changed-concurrency-cooldown', baseUrl: 'https://ai.example/v1', concurrency: 3 };
    getAIRequestLimiter(config).notifyRateLimit(120000);
    const updated = getAIRequestLimiter({ ...config, concurrency: 1 });
    let admitted = false;
    const pending = updated.acquire().then(release => { admitted = true; release(); });
    await vi.advanceTimersByTimeAsync(119999);
    expect(admitted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(admitted).toBe(true);
    await pending;
  });

  it('preserves RPM history when the config concurrency changes', async () => {
    vi.useFakeTimers();
    const config = { id: 'changed-concurrency-rpm', baseUrl: 'https://ai.example/v1', concurrency: 3 };
    const original = getAIRequestLimiter(config);
    for (let i = 0; i < 60; i++) (await original.acquire())();
    const updated = getAIRequestLimiter({ ...config, concurrency: 1 });
    let admitted = false;
    const pending = updated.acquire().then(release => { admitted = true; release(); });
    await vi.advanceTimersByTimeAsync(59999);
    expect(admitted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(admitted).toBe(true);
    await pending;
  });

});
