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

  it('finds an owned link by URL case-insensitively in Prisma', async () => {
    const prisma = { link: { findFirst: vi.fn().mockResolvedValue(null) } };
    await createPrismaRepository(prisma as never).findLinkByUrl(7, 'https://example.com/');
    expect(prisma.link.findFirst).toHaveBeenCalledWith({
      where: { folder: { userId: 7 }, url: { equals: 'https://example.com/', mode: 'insensitive' } },
      orderBy: { id: 'asc' },
    });
  });
});
