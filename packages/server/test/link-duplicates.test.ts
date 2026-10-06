import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { createPrismaRepository } from '../src/services/prisma.repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

function save(cookie: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload });
}

describe('POST /api/admin/links duplicate detection', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the existing link with a flag instead of saving the same URL twice', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const archive = await folder(cookie, 'Archive');
    const created = await save(cookie, { folderId: inbox, name: 'Example', url: 'https://Example.com/Path' });
    expect(created.statusCode).toBe(200);
    expect(created.json().data.existing).toBeUndefined();

    const again = await save(cookie, { folderId: archive, name: 'Other name', url: 'HTTPS://example.COM/Path' });

    expect(again.statusCode).toBe(200);
    expect(again.json().data).toMatchObject({ id: created.json().data.id, folderId: inbox, name: 'Example', existing: true });
    expect(await repo.listLinks(1)).toHaveLength(1);
  });

  it('treats URLs that differ only in path case as different bookmarks', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    await save(cookie, { folderId: inbox, name: 'Upper', url: 'https://x.com/A' });

    const lower = await save(cookie, { folderId: inbox, name: 'Lower', url: 'https://x.com/a' });

    expect(lower.json().data.existing).toBeUndefined();
    expect(await repo.listLinks(1)).toHaveLength(2);
  });

  it('matches URLs the way the duplicates report does', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    await save(cookie, { folderId: inbox, name: 'GitHub', url: 'https://github.com' });

    const again = await save(cookie, { folderId: inbox, name: 'GitHub', url: '  https://github.com/  ' });

    expect(again.json().data.existing).toBe(true);
  });

  it('saves another copy when the caller asks for one', async () => {
    const cookie = await signIn('owner', true);
    const inbox = await folder(cookie, 'Inbox');
    const first = await save(cookie, { folderId: inbox, name: 'Example', url: 'https://example.com/' });

    const copy = await save(cookie, { folderId: inbox, name: 'Example copy', url: 'https://example.com/', allowDuplicate: true });

    expect(copy.json().data.id).not.toBe(first.json().data.id);
    expect(copy.json().data.existing).toBeUndefined();
    expect(await repo.listLinks(1)).toHaveLength(2);
  });

  it('does not treat another user’s bookmark as a duplicate', async () => {
    const owner = await signIn('owner', true);
    const reader = await signIn('reader');
    await save(owner, { folderId: await folder(owner, 'Mine'), name: 'Example', url: 'https://example.com/' });

    const theirs = await save(reader, { folderId: await folder(reader, 'Theirs'), name: 'Example', url: 'https://example.com/' });

    expect(theirs.json().data.existing).toBeUndefined();
  });

  it('still 404s for a foreign folder before checking duplicates', async () => {
    const owner = await signIn('owner', true);
    const reader = await signIn('reader');
    const mine = await folder(owner, 'Mine');
    await save(owner, { folderId: mine, name: 'Example', url: 'https://example.com/' });

    const denied = await save(reader, { folderId: mine, name: 'Example', url: 'https://example.com/' });

    expect(denied.statusCode).toBe(404);
  });

  it('finds an owned link by its exact normalized URL in Prisma', async () => {
    const prisma = { link: { findFirst: vi.fn().mockResolvedValue(null) } };
    await createPrismaRepository(prisma as never).findLinkByUrl(7, 'https://example.com/');
    expect(prisma.link.findFirst).toHaveBeenCalledWith({
      where: { folder: { userId: 7 }, url: 'https://example.com/' },
      orderBy: { id: 'asc' },
    });
  });
});

describe('bookmark lookup for the extension badge', () => {
  let lookupApp: FastifyInstance;
  afterEach(async () => lookupApp?.close());

  it('answers whether a URL is saved, with its folder path, for a read-only token', async () => {
    lookupApp = await buildApp({ repo: new MemoryRepository(false), sessionSecret: 'test-session-secret-that-is-long-enough', encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' } as any);
    const setup = await lookupApp.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'a@nono.test', displayName: 'Admin', password: 'Password2026!' } });
    const cookie = String(setup.headers['set-cookie']).split(';', 1)[0];
    const parent = (await lookupApp.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Work' } })).json().data.id;
    const child = (await lookupApp.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Docs', parentId: parent } })).json().data.id;
    await lookupApp.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: child, name: 'MDN', url: 'https://developer.mozilla.org/Web', tags: ['web'] } });
    const token = (await lookupApp.inject({ method: 'POST', url: '/api/admin/tokens', headers: { cookie }, payload: { name: 'Ext', scopes: ['bookmarks:read'] } })).json().data.token;
    const lookup = async (url: string) => (await lookupApp.inject({ method: 'POST', url: '/api/admin/links/lookup', headers: { authorization: `Bearer ${token}` }, payload: { url } })).json();

    expect((await lookup('https://DEVELOPER.mozilla.org/Web')).data).toMatchObject({ saved: true, link: { name: 'MDN', folderPath: ['Work', 'Docs'], tags: ['web'] } });
    expect((await lookup('https://developer.mozilla.org/web')).data).toEqual({ saved: false });
    expect((await lookup('not a url')).data).toEqual({ saved: false });
  });
});
