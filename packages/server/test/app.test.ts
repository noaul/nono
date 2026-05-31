import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const adminPassword = 'Password2026!';

let app: FastifyInstance;
let repo: MemoryRepository;

async function setupAdmin() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: {
      username: 'admin',
      email: 'admin@nono.test',
      displayName: 'Admin',
      password: adminPassword,
    },
  });
  const cookie = response.headers['set-cookie'];
  return Array.isArray(cookie) ? cookie[0] : String(cookie);
}

describe('Nono Fastify app', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a unified health response', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ code: 0, data: { ok: true }, message: '' });
  });

  it('initializes an admin, logs in, and exposes the current session', async () => {
    const setupCookie = await setupAdmin();

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: adminPassword },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().data.user.role).toBe('admin');

    const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: setupCookie } });
    expect(session.statusCode).toBe(200);
    expect(session.json().data).toMatchObject({ authenticated: true, setupRequired: false });
  });

  it('keeps disabled registration and unauthenticated errors in the unified response envelope', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'reader', email: 'reader@nono.test', password: 'Reader2026!' },
    });
    expect(register.statusCode).toBe(403);
    expect(register.json()).toEqual({ code: 403, data: null, message: 'Registration is closed' });

    const folders = await app.inject({ method: 'GET', url: '/api/admin/folders' });
    expect(folders.statusCode).toBe(401);
    expect(folders.json()).toEqual({ code: 401, data: null, message: 'Authentication required' });
  });

  it('creates API tokens and accepts bearer authentication', async () => {
    const cookie = await setupAdmin();
    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Chrome extension' },
    });
    expect(tokenResponse.statusCode).toBe(200);
    const token = tokenResponse.json().data.token;

    const folders = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'AI 工具', icon: 'sparkles' },
    });
    expect(folders.statusCode).toBe(200);
    expect(folders.json().data.name).toBe('AI 工具');
  });

  it('imports and exports Netscape browser bookmarks', async () => {
    const cookie = await setupAdmin();
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Dev</H3><DL><p><DT><A HREF="https://github.com/">GitHub</A></DL><p></DL><p>';

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: { html },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().data).toMatchObject({ addedFolders: 1, addedLinks: 1, skippedDuplicates: 0 });

    const exported = await app.inject({ method: 'GET', url: '/api/admin/bookmarks/export', headers: { cookie } });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('text/html');
    expect(exported.body).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(exported.body).toContain('https://github.com/');
  });

  it('uses PostgreSQL-safe sort order values when importing bookmarks', async () => {
    const cookie = await setupAdmin();
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Tools</H3><DL><p><DT><A HREF="https://example.com/">Example</A></DL><p></DL><p>';

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: { html },
    });
    expect(imported.statusCode).toBe(200);

    const [folder] = await repo.listFolders(1);
    const [link] = await repo.listLinks(1);
    expect(folder.sortOrder).toBeLessThanOrEqual(2_147_483_647);
    expect(link.sortOrder).toBeLessThanOrEqual(2_147_483_647);
  });

  it('skips browser-only bookmark URLs and data icons during import', async () => {
    const cookie = await setupAdmin();
    const html = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>',
      '<DT><H3>Chrome Export</H3><DL><p>',
      '<DT><A HREF="https://example.com/article" ICON="data:image/png;base64,abc123">Article</A>',
      '<DT><A HREF="chrome://bookmarks/">Bookmarks</A>',
      '<DT><A HREF="javascript:alert(1)">Bookmarklet</A>',
      '</DL><p></DL><p>',
    ].join('');

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: { html },
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.json().data).toMatchObject({ addedFolders: 1, addedLinks: 1, skippedDuplicates: 0, skippedInvalid: 2 });
    const links = await repo.listLinks(1);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ name: 'Article', url: 'https://example.com/article', icon: '' });
  });

  it('persists manual link sorting within a folder', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Manual' } });
    const folderId = folder.json().data.id;
    const first = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'First', url: 'https://first.example/' } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Second', url: 'https://second.example/' } });
    const third = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Third', url: 'https://third.example/' } });

    const reorder = await app.inject({
      method: 'PUT',
      url: '/api/admin/links/reorder',
      headers: { cookie },
      payload: { ids: [second.json().data.id, first.json().data.id, third.json().data.id] },
    });

    expect(reorder.statusCode).toBe(200);
    const links = await repo.listLinks(1);
    expect(links.map((link) => link.name)).toEqual(['Second', 'First', 'Third']);
  });

  it('falls back when LLM is not configured and saves the confirmed bookmark', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Reading' } });

    const analysis = await app.inject({
      method: 'POST',
      url: '/api/ai/analyze',
      headers: { cookie },
      payload: { url: 'https://example.com/article', title: 'Example Article', content: 'A concise summary' },
    });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().data).toMatchObject({ suggestedName: 'Example Article', createFolder: false });

    const saved = await app.inject({
      method: 'POST',
      url: '/api/ai/save',
      headers: { cookie },
      payload: { url: 'https://example.com/article', title: 'Example Article', name: 'Example Article' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.url).toBe('https://example.com/article');
    expect(await repo.listLinks(1)).toHaveLength(1);
  });
});
