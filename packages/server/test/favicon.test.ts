import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Disable the on-disk favicon cache layer in tests.
process.env.NONO_FAVICON_CACHE_DIR = '';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function imageResponse() {
  return new Response(new Uint8Array(PNG_BYTES), { status: 200, headers: { 'content-type': 'image/png' } });
}

let app: FastifyInstance;

describe('favicon proxy', () => {
  beforeEach(async () => {
    app = await buildApp({ repo: new MemoryRepository(false), sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('rejects invalid domains', async () => {
    for (const domain of ['', 'localhost', '127.0.0.1', 'not a domain', 'https://evil.test/x']) {
      const response = await app.inject({ method: 'GET', url: `/api/favicon?domain=${encodeURIComponent(domain)}` });
      expect(response.statusCode).toBe(400);
    }
  });

  it('proxies an icon and serves repeat requests from cache', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse());

    const first = await app.inject({ method: 'GET', url: '/api/favicon?domain=cache-hit.example' });
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toContain('image/png');
    expect(first.headers['cache-control']).toContain('max-age=604800');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await app.inject({ method: 'GET', url: '/api/favicon?domain=cache-hit.example' });
    expect(second.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls through sources and returns 404 when no icon is found', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));

    const response = await app.inject({ method: 'GET', url: '/api/favicon?domain=cache-miss.example' });
    expect(response.statusCode).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const repeat = await app.inject({ method: 'GET', url: '/api/favicon?domain=cache-miss.example' });
    expect(repeat.statusCode).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects non-image upstream responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));

    const response = await app.inject({ method: 'GET', url: '/api/favicon?domain=not-an-image.example' });
    expect(response.statusCode).toBe(404);
  });
});
