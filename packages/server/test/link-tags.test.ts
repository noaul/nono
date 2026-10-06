import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository, normalizeTags } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let app: FastifyInstance;
let cookie: string;
let folderId: number;

async function save(payload: Record<string, unknown>) {
  return (await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, ...payload } })).json().data;
}

async function tags() {
  return (await app.inject({ method: 'GET', url: '/api/admin/tags', headers: { cookie } })).json().data;
}

describe('link tags', () => {
  beforeEach(async () => {
    app = await buildApp({ repo: new MemoryRepository(false), sessionSecret, encryptionKey } as any);
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'a@nono.test', displayName: 'Admin', password: 'Password2026!' } });
    cookie = String(setup.headers['set-cookie']).split(';', 1)[0];
    folderId = (await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Inbox' } })).json().data.id;
  });

  afterEach(async () => {
    await app.close();
  });

  it('normalizes tags: trims, collapses spaces, drops repeats ignoring case and caps the count', () => {
    expect(normalizeTags([' Web  Dev ', 'web dev', '', 'Go'])).toEqual(['Web Dev', 'Go']);
    expect(normalizeTags(Array.from({ length: 30 }, (_, index) => `t${index}`))).toHaveLength(20);
    expect(normalizeTags(['x'.repeat(50)])[0]).toHaveLength(32);
  });

  it('saves, edits and counts tags across folders', async () => {
    const other = (await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Other' } })).json().data.id;
    const first = await save({ name: 'A', url: 'https://a.example/', tags: ['rust', 'cli'] });
    await save({ folderId: other, name: 'B', url: 'https://b.example/', tags: ['rust'] });
    expect(first.tags).toEqual(['rust', 'cli']);
    expect(await tags()).toEqual([{ name: 'rust', count: 2 }, { name: 'cli', count: 1 }]);

    const updated = (await app.inject({ method: 'PUT', url: `/api/admin/links/${first.id}`, headers: { cookie }, payload: { tags: ['cli'] } })).json().data;
    expect(updated.tags).toEqual(['cli']);
    expect(await tags()).toEqual([{ name: 'cli', count: 1 }, { name: 'rust', count: 1 }]);
  });

  it('renames a tag everywhere, merging with a tag a link already has', async () => {
    const both = await save({ name: 'A', url: 'https://a.example/', tags: ['js', 'javascript'] });
    await save({ name: 'B', url: 'https://b.example/', tags: ['js'] });

    const response = await app.inject({ method: 'PUT', url: '/api/admin/tags/rename', headers: { cookie }, payload: { from: 'js', to: 'javascript' } });

    expect(response.json().data).toEqual({ renamed: 2, name: 'javascript' });
    expect(await tags()).toEqual([{ name: 'javascript', count: 2 }]);
    const reloaded = (await app.inject({ method: 'GET', url: '/api/admin/links', headers: { cookie } })).json().data.find((link: any) => link.id === both.id);
    expect(reloaded.tags).toEqual(['javascript']);
  });

  it('deletes a tag from every link', async () => {
    await save({ name: 'A', url: 'https://a.example/', tags: ['old', 'keep'] });
    const response = await app.inject({ method: 'DELETE', url: '/api/admin/tags/old', headers: { cookie } });
    expect(response.json().data).toEqual({ removed: 1 });
    expect(await tags()).toEqual([{ name: 'keep', count: 1 }]);
  });

  it('keeps tags private to their owner', async () => {
    await save({ name: 'A', url: 'https://a.example/', tags: ['secret-tag'] });
    const navigation = await app.inject({ method: 'GET', url: '/api/navigation/admin' });
    expect(navigation.body).not.toContain('secret-tag');
  });
});
