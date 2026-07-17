import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { extractPageMeta } from '../src/routes/admin/meta.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let app: FastifyInstance;
let publicFetcher: ReturnType<typeof vi.fn>;

async function setupCookie() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password: 'Password2026!' },
  });
  const cookie = response.headers['set-cookie'];
  return Array.isArray(cookie) ? cookie[0] : String(cookie);
}

describe('fetch-meta endpoint', () => {
  beforeEach(async () => {
    publicFetcher = vi.fn(async (url: string) => {
      const response = await globalThis.fetch(url);
      return {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: Buffer.from(await response.arrayBuffer()),
      };
    });
    app = await buildApp({ repo: new MemoryRepository(false), sessionSecret, encryptionKey, publicFetcher } as any);
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('requires auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/fetch-meta?url=https%3A%2F%2Fexample.com' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects private and non-http targets', async () => {
    const cookie = await setupCookie();
    for (const url of ['http://localhost/x', 'http://127.0.0.1/x', 'http://192.168.1.1/', 'ftp://example.com/', 'not-a-url']) {
      const response = await app.inject({ method: 'GET', url: `/api/admin/fetch-meta?url=${encodeURIComponent(url)}`, headers: { cookie } });
      expect(response.statusCode).toBe(400);
    }
  });

  it('rejects public-looking hostnames that resolve to private infrastructure', async () => {
    const cookie = await setupCookie();
    publicFetcher.mockRejectedValue(new Error('Target address is not public'));
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/fetch-meta?url=https%3A%2F%2Fmetadata.example%2F',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('extracts title and description from fetched html', async () => {
    const cookie = await setupCookie();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><head><title> Vue.js &amp; Friends </title><meta name="description" content="The Progressive Framework"></head></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const response = await app.inject({ method: 'GET', url: '/api/admin/fetch-meta?url=https%3A%2F%2Fvuejs.org%2F', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ title: 'Vue.js & Friends', description: 'The Progressive Framework' });
  });

  it('returns empty meta on upstream failure instead of erroring', async () => {
    const cookie = await setupCookie();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));

    const response = await app.inject({ method: 'GET', url: '/api/admin/fetch-meta?url=https%3A%2F%2Fexample.com%2F', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ title: '', description: '' });
  });
});

describe('extractPageMeta', () => {
  it('falls back to og:description and trims entities', () => {
    const meta = extractPageMeta('<title>A&lt;B</title><meta property="og:description" content="hello&nbsp;world">');
    expect(meta).toEqual({ title: 'A<B', description: 'hello world' });
  });
});
