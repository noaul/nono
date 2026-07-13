import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('serves the setup admin site through the root navigation alias', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'nono',
        email: 'nono@nono.test',
        displayName: 'Nono',
        password: adminPassword,
      },
    });
    expect(setup.statusCode).toBe(200);

    const navigation = await app.inject({ method: 'GET', url: '/api/navigation/admin' });

    expect(navigation.statusCode).toBe(200);
    expect(navigation.json().data.site).toMatchObject({ slug: 'nono', userId: 1 });
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

  it('normalizes site appearance settings and rejects unsafe portal URLs', async () => {
    const cookie = await setupAdmin();
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie },
      payload: {
        settings: {
          analytics: { enabled: true },
          appearance: {
            cardRadius: 999,
            modalOpacity: '38',
            tabBlur: -12,
            adminBlur: {},
          },
        },
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.settings).toMatchObject({
      analytics: { enabled: true },
      appearance: {
        cardRadius: 24,
        modalOpacity: 38,
        tabBlur: 0,
        adminBlur: 10,
      },
    });

    const unsafe = await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie },
      payload: {
        settings: {
          portal: {
            enabled: true,
            url: 'javascript:alert(1)',
            label: 'Unsafe',
            imageUrl: '',
            openInNewTab: false,
          },
        },
      },
    });

    expect(unsafe.statusCode).toBe(400);
  });

  it('summarizes token governance and rejects expired token creation', async () => {
    const cookie = await setupAdmin();
    const neverExpires = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Permanent token' },
    });
    expect(neverExpires.statusCode).toBe(200);

    const expired = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Expired token', expiresAt: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(expired.statusCode).toBe(400);

    const future = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Future token', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
    });
    expect(future.statusCode).toBe(200);

    const summary = await app.inject({ method: 'GET', url: '/api/admin/tokens/summary', headers: { cookie } });

    expect(summary.statusCode).toBe(200);
    expect(summary.json().data).toMatchObject({ total: 2, active: 2, expired: 0, neverExpires: 1, expiringSoon: 0 });
  });

  it('returns metadata for the current bearer token', async () => {
    const cookie = await setupAdmin();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Extension token', expiresAt },
    });
    const token = tokenResponse.json().data.token;

    const current = await app.inject({
      method: 'GET',
      url: '/api/admin/tokens/current',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(current.statusCode).toBe(200);
    expect(current.json().data).toMatchObject({ name: 'Extension token', expiresAt });
    expect(current.json().data.token).toContain('...');
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

  it('previews bookmark imports without writing folders or links', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Existing' } });
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: 1, name: 'GitHub', url: 'https://github.com/' } });
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Dev</H3><DL><p><DT><A HREF="https://github.com/">GitHub</A><DT><A HREF="https://example.com/">Example</A><DT><A HREF="chrome://bookmarks/">Chrome</A></DL><p></DL><p>';

    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/preview',
      headers: { cookie },
      payload: { html },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json().data.summary).toMatchObject({
      parsedFolders: 1,
      parsedLinks: 3,
      newFolders: 1,
      newLinks: 1,
      duplicateLinks: 1,
      invalidLinks: 1,
    });
    expect(await repo.listFolders(1)).toHaveLength(1);
    expect(await repo.listLinks(1)).toHaveLength(1);
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

  it('persists link sorting through one repository batch operation', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Batch links' } });
    const folderId = folder.json().data.id;
    const first = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'First', url: 'https://first.example/' } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Second', url: 'https://second.example/' } });
    const batch = vi.spyOn(repo, 'reorderLinks');
    const sequential = vi.spyOn(repo, 'updateLink');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/links/reorder',
      headers: { cookie },
      payload: { ids: [second.json().data.id, second.json().data.id, first.json().data.id, 'invalid'] },
    });

    expect(response.statusCode).toBe(200);
    expect(batch).toHaveBeenCalledOnce();
    expect(batch).toHaveBeenCalledWith(1, [second.json().data.id, first.json().data.id]);
    expect(sequential).not.toHaveBeenCalled();
  });

  it('persists folder sorting through one repository batch operation', async () => {
    const cookie = await setupAdmin();
    const first = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'First' } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Second' } });
    const batch = vi.spyOn(repo, 'reorderFolders');
    const sequential = vi.spyOn(repo, 'updateFolder');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/folders/reorder',
      headers: { cookie },
      payload: { ids: [second.json().data.id, second.json().data.id, first.json().data.id, 0] },
    });

    expect(response.statusCode).toBe(200);
    expect(batch).toHaveBeenCalledOnce();
    expect(batch).toHaveBeenCalledWith(1, [second.json().data.id, first.json().data.id]);
    expect(sequential).not.toHaveBeenCalled();
  });

  it('reports duplicate admin links by normalized URL', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Tools' } });
    const folderId = folder.json().data.id;
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'GitHub A', url: 'https://github.com/' } });
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'GitHub B', url: 'https://github.com' } });

    const duplicates = await app.inject({ method: 'GET', url: '/api/admin/links/duplicates', headers: { cookie } });

    expect(duplicates.statusCode).toBe(200);
    expect(duplicates.json().data.groups).toHaveLength(1);
    expect(duplicates.json().data.groups[0].links.map((link: any) => link.name)).toEqual(['GitHub A', 'GitHub B']);
  });

  it('bulk moves and bulk deletes admin links', async () => {
    const cookie = await setupAdmin();
    const firstFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Inbox' } });
    const secondFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Archive' } });
    const inboxId = firstFolder.json().data.id;
    const archiveId = secondFolder.json().data.id;
    const first = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: inboxId, name: 'One', url: 'https://one.example/' } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: inboxId, name: 'Two', url: 'https://two.example/' } });

    const move = await app.inject({
      method: 'POST',
      url: '/api/admin/links/bulk-move',
      headers: { cookie },
      payload: { ids: [first.json().data.id, second.json().data.id], folderId: archiveId },
    });
    expect(move.statusCode).toBe(200);
    expect(move.json().data).toEqual({ moved: 2 });

    const deleteResult = await app.inject({
      method: 'POST',
      url: '/api/admin/links/bulk-delete',
      headers: { cookie },
      payload: { ids: [first.json().data.id, second.json().data.id] },
    });
    expect(deleteResult.statusCode).toBe(200);
    expect(deleteResult.json().data).toEqual({ deleted: 2 });
    expect(await repo.listLinks(1)).toHaveLength(0);
  });

  it('checks selected admin link health without writing link state', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Quality' } });
    const folderId = folder.json().data.id;
    const ok = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'OK', url: 'https://ok.example/' } });
    const broken = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Broken', url: 'https://broken.example/' } });
    const invalid = await repo.createLink({ folderId, name: 'Chrome', url: 'chrome://bookmarks/', icon: '', description: '', sortOrder: 10 });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (href.includes('ok.example')) return new Response('', { status: 200 });
      if (href.includes('broken.example')) return new Response('', { status: 404 });
      return new Response('', { status: 500 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const health = await app.inject({
      method: 'POST',
      url: '/api/admin/links/health-check',
      headers: { cookie },
      payload: { ids: [ok.json().data.id, broken.json().data.id, invalid.id] },
    });
    globalThis.fetch = originalFetch;

    expect(health.statusCode).toBe(200);
    expect(health.json().data.summary).toMatchObject({ total: 3, ok: 1, broken: 1, invalid: 1, timeout: 0 });
    expect(health.json().data.results.map((result: any) => result.status)).toEqual(['ok', 'broken', 'invalid']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects folder parent cycles', async () => {
    const cookie = await setupAdmin();
    const parent = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Parent' } });
    const child = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Child', parentId: parent.json().data.id } });

    const selfParent = await app.inject({
      method: 'PUT',
      url: `/api/admin/folders/${parent.json().data.id}`,
      headers: { cookie },
      payload: { parentId: parent.json().data.id },
    });
    expect(selfParent.statusCode).toBe(400);

    const descendantParent = await app.inject({
      method: 'PUT',
      url: `/api/admin/folders/${parent.json().data.id}`,
      headers: { cookie },
      payload: { parentId: child.json().data.id },
    });
    expect(descendantParent.statusCode).toBe(400);
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
