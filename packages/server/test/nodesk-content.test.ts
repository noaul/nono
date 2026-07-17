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

describe('Nodesk local content API', () => {
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

  it('requires authentication for local content writes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/nodesk/files/batch',
      payload: { files: [{ path: 'src/app/projects/list.json', contentBase64: Buffer.from('[]').toString('base64') }] },
    });

    expect(response.statusCode).toBe(401);
  });

  it('requires an administrator for every Nodesk management endpoint', async () => {
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

  it('rejects paths outside the Nodesk content allowlist', async () => {
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
});
