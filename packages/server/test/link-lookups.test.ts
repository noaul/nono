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

async function folder(cookie: string, name: string, password?: string) {
  const response = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name, password } });
  return response.json().data.id as number;
}

async function link(cookie: string, folderId: number, name: string, url: string) {
  const response = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name, url, nameMode: 'manual' } });
  return response.json().data.id as number;
}

describe('single-link lookups', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
  });

  it('scopes getLink, getLinksByIds and listFolderLinks to the owner', async () => {
    const admin = await signIn('owner', true);
    const reader = await signIn('reader');
    const mine = await folder(admin, 'Mine');
    const theirs = await folder(reader, 'Theirs');
    const a = await link(admin, mine, 'A', 'https://a.example/');
    const b = await link(admin, mine, 'B', 'https://b.example/');
    const foreign = await link(reader, theirs, 'C', 'https://c.example/');

    expect(await repo.getLink(1, a)).toMatchObject({ id: a, name: 'A' });
    expect(await repo.getLink(1, foreign)).toBeNull();
    expect((await repo.getLinksByIds(1, [b, foreign, a])).map((item) => item.id).sort()).toEqual([a, b].sort());
    expect(await repo.getLinksByIds(1, [])).toEqual([]);
    expect((await repo.listFolderLinks(1, mine)).map((item) => item.id)).toHaveLength(2);
    expect(await repo.listFolderLinks(1, theirs)).toEqual([]);
  });

  it('serves update, move, delete and bulk-move without loading every link', async () => {
    const admin = await signIn('owner', true);
    const reader = await signIn('reader');
    const source = await folder(admin, 'Source');
    const target = await folder(admin, 'Target');
    const foreignFolder = await folder(reader, 'Theirs');
    const a = await link(admin, source, 'A', 'https://a.example/');
    const b = await link(admin, source, 'B', 'https://b.example/');
    const foreign = await link(reader, foreignFolder, 'C', 'https://c.example/');
    const listLinks = vi.spyOn(repo, 'listLinks');

    const missing = await app.inject({ method: 'PUT', url: `/api/admin/links/${foreign}`, headers: { cookie: admin }, payload: { name: 'X' } });
    expect(missing.statusCode).toBe(404);
    const updated = await app.inject({ method: 'PUT', url: `/api/admin/links/${a}`, headers: { cookie: admin }, payload: { name: 'A2' } });
    expect(updated.json().data.name).toBe('A2');

    const missingMove = await app.inject({ method: 'PUT', url: '/api/admin/links/move', headers: { cookie: admin }, payload: { linkId: foreign, targetFolderId: target, sourceIds: [], targetIds: [foreign] } });
    expect(missingMove.statusCode).toBe(404);

    const bulk = await app.inject({ method: 'POST', url: '/api/admin/links/bulk-move', headers: { cookie: admin }, payload: { ids: [a, b], folderId: target } });
    expect(bulk.json().data).toEqual({ moved: 2 });
    expect((await repo.getLinksByIds(1, [a, b])).every((item) => item.folderId === target)).toBe(true);

    const removed = await app.inject({ method: 'DELETE', url: `/api/admin/links/${b}`, headers: { cookie: admin } });
    expect(removed.statusCode).toBe(200);
    expect(await repo.getLink(1, b)).toBeNull();

    expect(listLinks).not.toHaveBeenCalled();
  });

  it('unlocks a protected folder without loading every link', async () => {
    const admin = await signIn('admin', true);
    const locked = await folder(admin, 'Private', 'Folder2026!');
    const other = await folder(admin, 'Open');
    await link(admin, locked, 'Secret', 'https://secret.example/');
    await link(admin, other, 'Public', 'https://public.example/');
    const listLinks = vi.spyOn(repo, 'listLinks');

    const unlocked = await app.inject({ method: 'POST', url: `/api/navigation/admin/folder/${locked}/verify`, payload: { password: 'Folder2026!' } });

    expect(unlocked.json().data.links.map((item: any) => item.name)).toEqual(['Secret']);
    expect(listLinks).not.toHaveBeenCalled();
  });
});

describe('Prisma single-link lookups', () => {
  it('queries one link scoped to the owner', async () => {
    const prisma = { link: { findFirst: vi.fn().mockResolvedValue({ id: 4 }), findMany: vi.fn().mockResolvedValue([]) } };
    const prismaRepo = createPrismaRepository(prisma as never);

    await expect(prismaRepo.getLink(7, 4)).resolves.toEqual({ id: 4 });
    expect(prisma.link.findFirst).toHaveBeenCalledWith({ where: { id: 4, folder: { userId: 7 } } });

    await prismaRepo.getLinksByIds(7, [4, 5]);
    expect(prisma.link.findMany).toHaveBeenCalledWith({ where: { id: { in: [4, 5] }, folder: { userId: 7 } }, orderBy: [{ sortOrder: 'desc' }, { id: 'asc' }] });

    await prismaRepo.listFolderLinks(7, 3);
    expect(prisma.link.findMany).toHaveBeenLastCalledWith({ where: { folderId: 3, folder: { userId: 7 } }, orderBy: [{ sortOrder: 'desc' }, { id: 'asc' }] });
  });

  it('skips the query for an empty id list', async () => {
    const prisma = { link: { findMany: vi.fn() } };
    await expect(createPrismaRepository(prisma as never).getLinksByIds(7, [])).resolves.toEqual([]);
    expect(prisma.link.findMany).not.toHaveBeenCalled();
  });
});
