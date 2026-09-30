import { afterEach, describe, expect, it, vi } from 'vitest';
import { backend } from './backendAdapter';
import type { AIRequestError } from './aiRequestLimiter';

describe('AI proxy errors', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it.each([
    [{ 'retry-after-ms': '1500', 'retry-after': '9' }, 1500],
    [{ 'retry-after': '2.5' }, 2500],
    [{ 'retry-after': 'invalid' }, undefined],
    [{ 'retry-after': new Date(Date.now() + 10000).toUTCString() }, 'date'],
  ])('preserves HTTP status and retry timing metadata: %j', async (headers, retryAfterMs) => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) return Response.json({ status: 'ok' });
      if (url.endsWith('/settings')) return Response.json({});
      return new Response(JSON.stringify({ error: { message: 'Too many requests' } }), { status: 429, headers });
    });
    await backend.init();
    const error = await backend.proxyAIRequest('stored-id', {}).catch(error => error) as AIRequestError;
    expect(error).toMatchObject({ status: 429, statusCode: 429 });
    if (retryAfterMs === 'date') {
      expect(error.retryAfterMs).toBeGreaterThan(0);
      expect(error.retryAfterMs).toBeLessThanOrEqual(10000);
    } else {
      expect(error.retryAfterMs).toBe(retryAfterMs);
    }
  });
});
