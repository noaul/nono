import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let app: FastifyInstance;
let repo: MemoryRepository;
let cookie: string;

async function folder(payload: Record<string, unknown>) {
  return (await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload })).json().data.id as number;
}

async function link(folderId: number, name: string) {
  await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name, url: `https://${name.toLowerCase()}.example/`, nameMode: 'manual' } });
}

async function share(folderId: number, payload: Record<string, unknown> = {}) {
  return (await app.inject({ method: 'POST', url: `/api/admin/folders/${folderId}/shares`, headers: { cookie }, payload })).json().data;
}

async function open(path: string) {
  return app.inject({ method: 'GET', url: `/api${path.replace('/s/', '/share/')}` });
}

describe('read-only folder shares', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey } as any);
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'a@nono.test', displayName: 'Admin', password: 'Password2026!' } });
    cookie = String(setup.headers['set-cookie']).split(';', 1)[0];
  });

  afterEach(async () => {
    await app.close();
  });

  it('shares a folder subtree but leaves out password-protected sub-folders and other folders', async () => {
    const root = await folder({ name: 'Reading', password: 'Root2026!' });
    const child = await folder({ name: 'Essays', parentId: root });
    const locked = await folder({ name: 'Private', parentId: root, password: 'Inner2026!' });
    const outside = await folder({ name: 'Elsewhere' });
    await link(root, 'Root');
    await link(child, 'Essay');
    await link(locked, 'Secret');
    await link(outside, 'Other');

    const created = await share(root);
    expect(created.path).toMatch(/^\/s\/[A-Za-z0-9_-]{24}$/);
    const response = await open(created.path);

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-robots-tag']).toContain('noindex');
    const body = response.json().data;
    expect(body.folder.name).toBe('Reading');
    expect(body.folders.map((item: any) => item.name)).toEqual(['Reading', 'Essays']);
    expect(body.links.map((item: any) => item.name).sort()).toEqual(['Essay', 'Root']);
    expect(response.body).not.toContain('secret.example');
    expect(response.body).not.toContain('passwordHash');
  });

  it('counts views, lists shares with their link and revokes them', async () => {
    const id = await folder({ name: 'Shared' });
    const created = await share(id);
    await open(created.path);
    await open(created.path);

    const listed = (await app.inject({ method: 'GET', url: `/api/admin/folders/${id}/shares`, headers: { cookie } })).json().data;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ path: created.path, viewCount: 2 });

    const revoked = await app.inject({ method: 'DELETE', url: `/api/admin/shares/${created.id}`, headers: { cookie } });
    expect(revoked.statusCode).toBe(200);
    expect((await open(created.path)).statusCode).toBe(404);
  });

  it('stops answering once a share expires', async () => {
    const id = await folder({ name: 'Short' });
    const created = await share(id, { expiresInDays: 1 });
    expect((await open(created.path)).statusCode).toBe(200);
    repo.folderShares[0].expiresAt = new Date(Date.now() - 1000);
    expect((await open(created.path)).statusCode).toBe(404);
  });

  it('keeps only a hash and ciphertext of the token', async () => {
    const id = await folder({ name: 'Stored' });
    const created = await share(id);
    const token = created.path.slice(3);
    expect(JSON.stringify(repo.folderShares)).not.toContain(token);
  });

  it('answers 404 for malformed and unknown tokens, and stops with the folder', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/share/short' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/share/AAAAAAAAAAAAAAAAAAAAAAAA' })).statusCode).toBe(404);
    const id = await folder({ name: 'Gone' });
    const created = await share(id);
    await app.inject({ method: 'DELETE', url: `/api/admin/folders/${id}`, headers: { cookie } });
    expect((await open(created.path)).statusCode).toBe(404);
  });

  it('does not let another user manage someone else’s shares', async () => {
    const id = await folder({ name: 'Mine' });
    const created = await share(id);
    await app.inject({ method: 'PUT', url: '/api/admin/config', headers: { cookie }, payload: { allowRegistration: true } });
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'other', email: 'o@nono.test', displayName: 'Other', password: 'Other2026!pass' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'other', password: 'Other2026!pass' } });
    const otherCookie = String(login.headers['set-cookie']).split(';', 1)[0];

    expect((await app.inject({ method: 'GET', url: `/api/admin/folders/${id}/shares`, headers: { cookie: otherCookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/shares/${created.id}`, headers: { cookie: otherCookie } })).statusCode).toBe(404);
  });
});
