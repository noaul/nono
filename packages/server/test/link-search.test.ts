import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

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

async function folder(cookie: string, name: string, parentId?: number) {
  const response = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name, parentId } });
  return response.json().data.id as number;
}

async function link(cookie: string, folderId: number, name: string, url: string, description = '') {
  await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name, url, description, nameMode: 'manual' } });
}

async function search(cookie: string, query: string) {
  return app.inject({ method: 'GET', url: `/api/admin/links/search?${query}`, headers: { cookie } });
}

describe('GET /api/admin/links/search', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
  });

  it('matches every term across name, URL and description and returns the folder path', async () => {
    const cookie = await signIn('admin', true);
    const dev = await folder(cookie, '开发');
    const tools = await folder(cookie, '工具', dev);
    await link(cookie, tools, 'GitHub', 'https://github.com/', '代码托管');
    await link(cookie, tools, 'GitLab', 'https://gitlab.com/', '自建代码托管');
    await link(cookie, dev, 'MDN', 'https://developer.mozilla.org/', 'Web 文档');

    const both = await search(cookie, 'q=git+代码');
    expect(both.statusCode).toBe(200);
    expect(both.json().data.items.map((item: { name: string }) => item.name)).toEqual(['GitHub', 'GitLab']);
    expect(both.json().data.items[0].folderPath).toEqual(['开发', '工具']);

    const shortTerm = await search(cookie, 'q=文档');
    expect(shortTerm.json().data.items.map((item: { name: string }) => item.name)).toEqual(['MDN']);

    const byHost = await search(cookie, 'q=MOZILLA');
    expect(byHost.json().data.items).toHaveLength(1);
  });

  it('ranks names that start with the query first and honours the limit', async () => {
    const cookie = await signIn('admin', true);
    const root = await folder(cookie, 'Root');
    await link(cookie, root, 'Awesome lists', 'https://example.com/notion-awesome');
    await link(cookie, root, 'Notion', 'https://notion.so/');

    const response = await search(cookie, 'q=notion&limit=1');
    expect(response.json().data.items.map((item: { name: string }) => item.name)).toEqual(['Notion']);
  });

  it('restricts results to a folder and its descendants', async () => {
    const cookie = await signIn('admin', true);
    const work = await folder(cookie, 'Work');
    const nested = await folder(cookie, 'Nested', work);
    const home = await folder(cookie, 'Home');
    await link(cookie, nested, 'Docs work', 'https://docs.work.test/');
    await link(cookie, home, 'Docs home', 'https://docs.home.test/');

    const response = await search(cookie, `q=docs&folderId=${work}`);
    expect(response.json().data.items.map((item: { name: string }) => item.name)).toEqual(['Docs work']);
    expect((await search(cookie, 'q=docs&folderId=9999')).statusCode).toBe(404);
  });

  it('never returns another user\'s bookmarks', async () => {
    const admin = await signIn('admin', true);
    await link(admin, await folder(admin, 'Private'), 'Secret plan', 'https://secret.test/');
    const reader = await signIn('reader');
    await link(reader, await folder(reader, 'Mine'), 'Reader notes', 'https://notes.test/');

    expect((await search(reader, 'q=secret')).json().data.items).toEqual([]);
    expect((await search(reader, 'q=notes')).json().data.items).toHaveLength(1);
  });

  it('rejects an empty query and requires sign-in', async () => {
    const cookie = await signIn('admin', true);
    expect((await search(cookie, 'q=%20')).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/admin/links/search?q=x' })).statusCode).toBe(401);
  });
});
