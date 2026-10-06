import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resetFaviconState } from '../src/routes/favicon.js';
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
let publicFetcher: ReturnType<typeof vi.fn>;
let publicAddressResolver: ReturnType<typeof vi.fn>;

describe('favicon proxy', () => {
  beforeEach(async () => {
    resetFaviconState();
    publicFetcher = vi.fn(async (url: string) => {
      const response = await globalThis.fetch(url);
      return {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: Buffer.from(await response.arrayBuffer()),
      };
    });
    publicAddressResolver = vi.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 });
    app = await buildApp({ repo: new MemoryRepository(false), sessionSecret, encryptionKey, publicFetcher, publicAddressResolver } as any);
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

  it('rejects domains that resolve to private infrastructure', async () => {
    publicAddressResolver.mockRejectedValue(new Error('Target address is not public'));
    const response = await app.inject({ method: 'GET', url: '/api/favicon?domain=metadata.google.internal.example' });
    expect(response.statusCode).toBe(400);
    expect(publicFetcher).not.toHaveBeenCalled();
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

  it('refuses SVG icons, which could carry script on this origin', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<svg onload="alert(1)"/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }));

    const response = await app.inject({ method: 'GET', url: '/api/favicon?domain=svg-icon.example' });
    expect(response.statusCode).toBe(404);
  });

  it('sandboxes served icons', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse());

    const response = await app.inject({ method: 'GET', url: '/api/favicon?domain=sandboxed.example' });
    expect(response.headers['content-security-policy']).toContain('sandbox');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('budgets upstream lookups per client but keeps serving cached icons', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => imageResponse());
    const statuses: number[] = [];
    for (let index = 0; index < 61; index++) {
      statuses.push((await app.inject({ method: 'GET', url: `/api/favicon?domain=site${index}.example` })).statusCode);
    }
    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses[60]).toBe(429);

    const cached = await app.inject({ method: 'GET', url: '/api/favicon?domain=site1.example' });
    expect(cached.statusCode).toBe(200);
  });

  it('prunes the disk cache once it passes its entry cap', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nono-favicon-'));
    process.env.NONO_FAVICON_CACHE_DIR = dir;
    try {
      for (let index = 0; index < 5000; index++) {
        await fs.writeFile(path.join(dir, `old${index}.example.json`), JSON.stringify({ contentType: '', expires: Date.now() + 60_000, miss: true }));
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse());
      const response = await app.inject({ method: 'GET', url: '/api/favicon?domain=newest.example' });
      expect(response.statusCode).toBe(200);
      const remaining = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
      expect(remaining.length).toBeLessThanOrEqual(4500);
    } finally {
      process.env.NONO_FAVICON_CACHE_DIR = '';
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
