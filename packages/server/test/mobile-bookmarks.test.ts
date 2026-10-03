import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const requestId = '0b6f5a3e-8c1d-4f6a-9b2e-7d4c3a1f0e9b';

let app: FastifyInstance;
let repo: MemoryRepository;

async function signIn(username: string, admin = false) {
  if (admin) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username, email: `${username}@nono.test`, password: 'Password2026!' } });
    return String(response.headers['set-cookie']).split(';', 1)[0];
  }
  await repo.updateConfig({ allowRegistration: true } as never);
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@nono.test`, password: 'Reader2026!' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: 'Reader2026!' } });
  return String(login.headers['set-cookie']).split(';', 1)[0];
}

async function folder(cookie: string, name: string) {
  const response = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name } });
  return response.json().data.id as number;
}

function save(headers: Record<string, string>, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/mobile/bookmarks', headers, payload });
}

describe('POST /api/mobile/bookmarks', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires a signed-in browser session', async () => {
    const anonymous = await save({}, { requestId, folderId: 1, name: 'x', url: 'https://example.com' });
    expect(anonymous.statusCode).toBe(401);

    const cookie = await signIn('owner', true);
    const token = await app.inject({ method: 'POST', url: '/api/admin/tokens', headers: { cookie }, payload: { name: 'Phone' } });
    const inbox = await folder(cookie, 'Inbox');
    const bearer = await save({ authorization: `Bearer ${token.json().data.token}` }, { requestId, folderId: inbox, name: 'x', url: 'https://example.com' });
    expect(bearer.statusCode).toBe(403);
    expect(repo.links).toHaveLength(0);
  });

  it('blocks cross-site writes like every other cookie-authenticated route', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const crossSite = await save({ cookie, 'sec-fetch-site': 'cross-site' }, { requestId, folderId: inbox, name: 'x', url: 'https://example.com' });
    expect(crossSite.statusCode).toBe(403);
    expect(repo.links).toHaveLength(0);
  });

  it('creates the bookmark and returns the same shape as POST /api/admin/links', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const response = await save({ cookie }, { requestId, folderId: inbox, name: '  中文标题  ', url: 'https://example.com/a', description: 'from chat' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ folderId: inbox, name: '中文标题', url: 'https://example.com/a', description: 'from chat', healthCheckEnabled: true });
    expect(response.json().data.existing).toBeUndefined();
    expect(repo.links).toHaveLength(1);
    expect(repo.mobileBookmarkRequests[0]).toMatchObject({ userId: 1, requestId, linkId: response.json().data.id, outcome: 'created' });
    expect(repo.auditLogs.find((log) => log.resourceType === 'bookmark')).toMatchObject({ action: 'create', resourceId: String(response.json().data.id) });
  });

  it('falls back to a name derived from the URL when the title is empty', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const response = await save({ cookie }, { requestId, folderId: inbox, name: '', url: 'https://docs.example.com/guide' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.name).not.toBe('');
  });

  it('returns 404 for a folder the user does not own and records nothing', async () => {
    const owner = await signIn('owner', true);
    const ownerFolder = await folder(owner, 'Private');
    const reader = await signIn('reader');

    const response = await save({ cookie: reader }, { requestId, folderId: ownerFolder, name: 'x', url: 'https://example.com' });

    expect(response.statusCode).toBe(404);
    expect(repo.links).toHaveLength(0);
    expect(repo.mobileBookmarkRequests).toHaveLength(0);
  });

  it.each([
    ['javascript URL', { url: 'javascript:alert(1)' }],
    ['ftp URL', { url: 'ftp://example.com/file' }],
    ['not a URL', { url: 'just some words' }],
    ['URL longer than 4096 characters', { url: `https://example.com/${'a'.repeat(4096)}` }],
    ['missing requestId', { requestId: undefined }],
    ['short requestId', { requestId: 'abc' }],
    ['requestId with spaces', { requestId: 'abc def ghi jkl' }],
    ['requestId over 80 characters', { requestId: 'a'.repeat(81) }],
    ['name over 240 characters', { name: 'n'.repeat(241) }],
    ['description over 2000 characters', { description: 'd'.repeat(2001) }],
  ])('rejects %s with 400', async (_label, override) => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const response = await save({ cookie }, { requestId, folderId: inbox, name: 'x', url: 'https://example.com', ...override });
    expect(response.statusCode).toBe(400);
    expect(repo.links).toHaveLength(0);
    expect(repo.mobileBookmarkRequests).toHaveLength(0);
  });

  it('returns the original bookmark when the same request is retried', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const payload = { requestId, folderId: inbox, name: 'Example', url: 'https://example.com/a', description: '' };
    const first = await save({ cookie }, payload);
    // A retry after a dropped response; whitespace and URL spelling normalize to the same content.
    const retry = await save({ cookie }, { ...payload, name: ' Example ', url: 'HTTPS://example.com/a' });

    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toMatchObject({ id: first.json().data.id, name: 'Example' });
    expect(retry.json().data.existing).toBeUndefined();
    expect(repo.links).toHaveLength(1);
    expect(repo.auditLogs.filter((log) => log.action === 'create' && log.resourceType === 'bookmark')).toHaveLength(1);
  });

  it('returns 409 when a requestId is reused for different content', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const archive = await folder(cookie, 'Archive');
    await save({ cookie }, { requestId, folderId: inbox, name: 'Example', url: 'https://example.com/a' });

    for (const change of [{ url: 'https://example.com/b' }, { name: 'Renamed' }, { folderId: archive }, { description: 'note' }]) {
      const response = await save({ cookie }, { requestId, folderId: inbox, name: 'Example', url: 'https://example.com/a', ...change });
      expect(response.statusCode).toBe(409);
    }
    expect(repo.links).toHaveLength(1);
  });

  it('creates exactly one bookmark when the same request arrives concurrently', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const payload = { requestId, folderId: inbox, name: 'Race', url: 'https://example.com/race' };

    const responses = await Promise.all(Array.from({ length: 5 }, () => save({ cookie }, payload)));

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(responses.map((response) => response.json().data.id)).size).toBe(1);
    expect(repo.links).toHaveLength(1);
    expect(repo.mobileBookmarkRequests).toHaveLength(1);
  });

  it('follows the duplicate-URL policy of POST /api/admin/links for a new requestId', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const archive = await folder(cookie, 'Archive');
    const original = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: inbox, name: 'Saved', url: 'https://Example.com/Path' } });

    const shared = await save({ cookie }, { requestId, folderId: archive, name: 'Shared', url: 'https://example.COM/Path' });
    const retried = await save({ cookie }, { requestId, folderId: archive, name: 'Shared', url: 'https://example.COM/Path' });

    expect(shared.statusCode).toBe(200);
    expect(shared.json().data).toMatchObject({ id: original.json().data.id, folderId: inbox, name: 'Saved', existing: true });
    expect(retried.json().data).toMatchObject({ id: original.json().data.id, existing: true });
    expect(repo.links).toHaveLength(1);
  });

  it('keeps requestIds separate per user', async () => {
    const owner = await signIn('owner', true);
    const reader = await signIn('reader');
    const ownerInbox = await folder(owner, 'Inbox');
    const readerInbox = await folder(reader, 'Inbox');

    const first = await save({ cookie: owner }, { requestId, folderId: ownerInbox, name: 'A', url: 'https://example.com/a' });
    const second = await save({ cookie: reader }, { requestId, folderId: readerInbox, name: 'B', url: 'https://example.com/b' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.id).not.toBe(first.json().data.id);
  });

  it('returns 410 when the bookmark from a retried request has since been deleted', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const payload = { requestId, folderId: inbox, name: 'Gone', url: 'https://example.com/gone' };
    const first = await save({ cookie }, payload);
    await app.inject({ method: 'DELETE', url: `/api/admin/links/${first.json().data.id}`, headers: { cookie } });

    const retry = await save({ cookie }, payload);

    expect(retry.statusCode).toBe(410);
    expect(repo.links).toHaveLength(0);
  });
});
