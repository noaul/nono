import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { hashPassword } from '../src/utils/crypto.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('NoDesk local content API', () => {
  let app: FastifyInstance;
  let contentDir: string;
  let cookie: string;
  let repo: MemoryRepository;

  beforeEach(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nono-nodesk-'));
    await fs.mkdir(path.join(contentDir, 'src/app/projects'), { recursive: true });
    await fs.writeFile(path.join(contentDir, 'src/app/projects/list.json'), JSON.stringify([{ name: 'Seed project' }]));
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey, nodeskContentDir: contentDir } as any);
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password: 'Password2026!' },
    });
    const header = setup.headers['set-cookie'];
    cookie = Array.isArray(header) ? header[0] : String(header);
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(contentDir, { recursive: true, force: true });
  });

  it('serves whitelisted public JSON content from the local content directory', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nodesk/content/projects' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([{ name: 'Seed project' }]);
  });

  it('keeps calendar events out of public NoDesk site content', async () => {
    await fs.mkdir(path.join(contentDir, 'src/config'), { recursive: true });
    await fs.writeFile(path.join(contentDir, 'src/config/site-content.json'), JSON.stringify({
      meta: { title: 'NoDesk' },
      calendarEvents: [{ id: 'private', date: '2026-08-22', time: '09:00', title: 'Private review' }],
    }));

    const token = (await repo.createToken(1, 'automation', null, ['*'])).token;
    const publicResponse = await app.inject({ method: 'GET', url: '/api/nodesk/content/site' });
    const tokenResponse = await app.inject({
      method: 'GET',
      url: '/api/nodesk/content/site',
      headers: { authorization: `Bearer ${token}` },
    });
    const adminResponse = await app.inject({ method: 'GET', url: '/api/nodesk/content/site', headers: { cookie } });

    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json().data).toEqual({ meta: { title: 'NoDesk' } });
    expect(tokenResponse.json().data).toEqual({ meta: { title: 'NoDesk' } });
    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.json().data.calendarEvents).toEqual([
      { id: 'private', date: '2026-08-22', time: '09:00', title: 'Private review' },
    ]);
  });

  it('persists the NoDesk quick-entry visibility without replacing other site settings', async () => {
    const before = await repo.getSite(1);
    await repo.updateSite(1, { settings: { ...before?.settings, existing: { value: 1 } } });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/nodesk/workbench',
      headers: { cookie },
      payload: { quickEntriesVisible: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ quickEntriesVisible: false });
    expect((await repo.getSite(1))?.settings).toMatchObject({
      existing: { value: 1 },
      nodeskWorkbench: { quickEntriesVisible: false },
    });
  });

  it('validates and persists editable NoDesk quick applications', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/nodesk/workbench',
      headers: { cookie },
      payload: {
        quickEntriesVisible: true,
        navigationEntries: [
          { id: 'docs', label: '文档', url: 'https://docs.example.com', icon: 'book-open', enabled: true, openInNewTab: true },
          { id: 'yumi', label: 'Yumi', url: '/yumi', icon: 'server-cog', enabled: true, openInNewTab: false },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect((await repo.getSite(1))?.settings).toMatchObject({
      navigationEntriesVersion: 4,
      navigationEntries: [
        { id: 'docs', label: '文档', url: 'https://docs.example.com', icon: 'book-open', enabled: true, openInNewTab: true },
        { id: 'yumi', label: 'Yumi', url: '/yumi', icon: 'server-cog', enabled: true, openInNewTab: false },
      ],
    });

    const unsafe = await app.inject({
      method: 'PUT',
      url: '/api/admin/nodesk/workbench',
      headers: { cookie },
      payload: {
        navigationEntries: [{ id: 'unsafe', label: 'Unsafe', url: 'javascript:alert(1)', icon: 'link', enabled: true, openInNewTab: false }],
      },
    });
    expect(unsafe.statusCode).toBe(400);
  });

  it('requires authentication for local content writes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/nodesk/files/batch',
      payload: { files: [{ path: 'src/app/projects/list.json', contentBase64: Buffer.from('[]').toString('base64') }] },
    });

    expect(response.statusCode).toBe(401);
  });

  it('requires an administrator for every NoDesk management endpoint', async () => {
    await repo.createUser({
      username: 'reader',
      email: 'reader@nono.test',
      displayName: 'Reader',
      passwordHash: await hashPassword('Reader2026!'),
      role: 'user',
      llmProvider: null,
      llmApiKey: null,
      llmModel: null,
      llmBaseUrl: null,
      llmReasoningEffort: null,
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'reader', password: 'Reader2026!' },
    });
    const header = login.headers['set-cookie'];
    const readerCookie = Array.isArray(header) ? header[0] : String(header);

    const requests = [
      app.inject({ method: 'GET', url: '/api/admin/nodesk/files?path=src%2Fapp%2Fprojects%2Flist.json', headers: { cookie: readerCookie } }),
      app.inject({ method: 'GET', url: '/api/admin/nodesk/files/list?path=src%2Fapp%2Fprojects', headers: { cookie: readerCookie } }),
      app.inject({
        method: 'POST',
        url: '/api/admin/nodesk/files/batch',
        headers: { cookie: readerCookie },
        payload: { files: [{ path: 'src/app/projects/list.json', contentBase64: Buffer.from('[]').toString('base64') }] },
      }),
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403]);
  });

  it('requires an administrator browser session for every NoDesk management endpoint', async () => {
    const token = (await repo.createToken(1, 'automation', null, ['*'])).token;
    const headers = { authorization: `Bearer ${token}` };

    const responses = await Promise.all([
      app.inject({
        method: 'PUT',
        url: '/api/admin/nodesk/workbench',
        headers,
        payload: { quickEntriesVisible: false },
      }),
      app.inject({ method: 'GET', url: '/api/admin/nodesk/files?path=src%2Fapp%2Fprojects%2Flist.json', headers }),
      app.inject({ method: 'GET', url: '/api/admin/nodesk/files/list?path=src%2Fapp%2Fprojects', headers }),
      app.inject({
        method: 'POST',
        url: '/api/admin/nodesk/files/batch',
        headers,
        payload: { files: [{ path: 'src/app/projects/list.json', contentBase64: Buffer.from('[]').toString('base64') }] },
      }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403, 403]);
    await expect(fs.readFile(path.join(contentDir, 'src/app/projects/list.json'), 'utf8')).resolves.toBe(JSON.stringify([{ name: 'Seed project' }]));
  });

  it('writes, lists, reads, and deletes local content files after login', async () => {
    const text = JSON.stringify([{ name: 'Local project' }]);
    const write = await app.inject({
      method: 'POST',
      url: '/api/admin/nodesk/files/batch',
      headers: { cookie },
      payload: { files: [{ path: 'src/app/projects/list.json', contentBase64: Buffer.from(text).toString('base64') }] },
    });
    expect(write.statusCode).toBe(200);

    const read = await app.inject({
      method: 'GET',
      url: '/api/admin/nodesk/files?path=src%2Fapp%2Fprojects%2Flist.json',
      headers: { cookie },
    });
    expect(Buffer.from(read.json().data.contentBase64, 'base64').toString('utf8')).toBe(text);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/nodesk/files/list?path=src%2Fapp%2Fprojects',
      headers: { cookie },
    });
    expect(list.json().data).toEqual(['src/app/projects/list.json']);

    const remove = await app.inject({
      method: 'POST',
      url: '/api/admin/nodesk/files/batch',
      headers: { cookie },
      payload: { files: [{ path: 'src/app/projects/list.json', contentBase64: null }] },
    });
    expect(remove.statusCode).toBe(200);
    await expect(fs.stat(path.join(contentDir, 'src/app/projects/list.json'))).rejects.toThrow();
  });

  it('rejects paths outside the NoDesk content allowlist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/nodesk/files/batch',
      headers: { cookie },
      payload: { files: [{ path: '../secret.txt', contentBase64: Buffer.from('secret').toString('base64') }] },
    });

    expect(response.statusCode).toBe(400);
    await expect(fs.stat(path.resolve(contentDir, '../secret.txt'))).rejects.toThrow();
  });

  it('accepts cache-safe versioned avatar image paths', async () => {
    const avatarPath = `public/images/avatar-${'a'.repeat(64)}.webp`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/nodesk/files/batch',
      headers: { cookie },
      payload: { files: [{ path: avatarPath, contentBase64: Buffer.from('avatar').toString('base64') }] },
    });

    expect(response.statusCode).toBe(200);
    await expect(fs.readFile(path.join(contentDir, avatarPath))).resolves.toEqual(Buffer.from('avatar'));
  });

  it('serves versioned avatar images from the runtime content store', async () => {
    const hash = 'b'.repeat(64);
    const avatarPath = `public/images/avatar-${hash}.webp`;
    const avatar = Buffer.from('runtime-avatar');
    const write = await app.inject({
      method: 'POST',
      url: '/api/admin/nodesk/files/batch',
      headers: { cookie },
      payload: { files: [{ path: avatarPath, contentBase64: avatar.toString('base64') }] },
    });
    expect(write.statusCode).toBe(200);

    const response = await app.inject({ method: 'GET', url: `/images/avatar-${hash}.webp` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.rawPayload).toEqual(avatar);
  });
});
