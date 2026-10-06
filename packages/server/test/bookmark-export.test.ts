import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { createBookmarkExportService } from '../src/services/bookmark-export.service.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function fakeWebDav(configured = true) {
  const files = new Map<string, string>();
  return {
    files,
    isWebDavConfigured: vi.fn(async () => configured),
    writeWebDavFile: vi.fn(async (folder: string, name: string, body: Buffer) => {
      files.set(`${folder}/${name}`, body.toString('utf8'));
      return `/nono/${folder}/${name}`;
    }),
    deleteWebDavFile: vi.fn(async (folder: string, name: string) => {
      files.delete(`${folder}/${name}`);
    }),
  };
}

async function seededRepo() {
  const repo = new MemoryRepository(false);
  const user = await repo.createUser({ username: 'admin', email: 'a@x', displayName: 'A', passwordHash: 'x', role: 'admin' });
  const folder = await repo.createFolder({ userId: user.id, name: 'Tools', sortOrder: 0 });
  await repo.createLink({ folderId: folder.id, name: 'GitHub', url: 'https://github.com/', sortOrder: 0 });
  return { repo, user };
}

describe('bookmark export to WebDAV', () => {
  it('uploads a timestamped HTML file plus bookmarks-latest.html and keeps only the newest files', async () => {
    const { repo, user } = await seededRepo();
    const webdav = fakeWebDav();
    const clock = { now: new Date('2026-10-06T01:02:03Z') };
    const service = createBookmarkExportService({ repo, backupCenter: webdav, now: () => clock.now, timeZone: 'Asia/Shanghai' });
    await service.update(user.id, { enabled: true, cadence: 'daily', hour: 4, weekday: 1, keep: 2 });

    for (const time of ['2026-10-06T01:02:03Z', '2026-10-07T01:02:03Z', '2026-10-08T01:02:03Z']) {
      clock.now = new Date(time);
      await service.runNow(user.id);
    }

    expect([...webdav.files.keys()].sort()).toEqual([
      'bookmarks/bookmarks-20261007-090203.html',
      'bookmarks/bookmarks-20261008-090203.html',
      'bookmarks/bookmarks-latest.html',
    ]);
    expect(webdav.files.get('bookmarks/bookmarks-latest.html')).toContain('HREF="https://github.com/"');
    const snapshot = await service.get();
    expect(snapshot.status).toMatchObject({ lastFile: 'bookmarks-20261008-090203.html', lastError: null, webDavConfigured: true });
  });

  it('runs once per schedule slot, and only when enabled with WebDAV configured', async () => {
    const { repo, user } = await seededRepo();
    const webdav = fakeWebDav();
    const clock = { now: new Date('2026-10-06T19:30:00Z') }; // 03:30 on the 7th in Shanghai
    const service = createBookmarkExportService({ repo, backupCenter: webdav, now: () => clock.now, timeZone: 'Asia/Shanghai' });

    expect(await service.runDue()).toEqual({ ran: false });
    await service.update(user.id, { enabled: true, cadence: 'daily', hour: 4, weekday: 1, keep: 5 });
    expect(await service.runDue()).toEqual({ ran: true }); // catches up the slot on the 6th
    expect(await service.runDue()).toEqual({ ran: false });
    clock.now = new Date('2026-10-06T20:05:00Z'); // 04:05 on the 7th
    expect(await service.runDue()).toEqual({ ran: true });
    expect(webdav.writeWebDavFile).toHaveBeenCalledTimes(4);
  });

  it('records a failure, keeps the slot and does not retry it', async () => {
    const { repo, user } = await seededRepo();
    const webdav = fakeWebDav();
    webdav.writeWebDavFile.mockRejectedValue(new Error('WebDAV upload failed (HTTP 507)'));
    const service = createBookmarkExportService({ repo, backupCenter: webdav, now: () => new Date('2026-10-06T21:00:00Z') });
    await service.update(user.id, { enabled: true, cadence: 'daily', hour: 4, weekday: 1, keep: 5 });

    expect(await service.runDue()).toEqual({ ran: true });
    expect(await service.runDue()).toEqual({ ran: false });
    expect((await service.get()).status.lastError).toContain('HTTP 507');
  });
});

describe('bookmark export routes', () => {
  let app: FastifyInstance;
  afterEach(async () => app?.close());

  it('requires an administrator session and validates settings', async () => {
    app = await buildApp({ repo: new MemoryRepository(false), sessionSecret, encryptionKey } as any);
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'a@nono.test', displayName: 'Admin', password: 'Password2026!' } });
    const cookie = String(setup.headers['set-cookie']).split(';', 1)[0];

    const initial = (await app.inject({ method: 'GET', url: '/api/admin/bookmark-export', headers: { cookie } })).json().data;
    expect(initial).toMatchObject({ settings: { enabled: false, cadence: 'daily' }, status: { webDavConfigured: false } });

    const saved = await app.inject({ method: 'PUT', url: '/api/admin/bookmark-export', headers: { cookie }, payload: { enabled: true, cadence: 'weekly', hour: 6, weekday: 0, keep: 8 } });
    expect(saved.json().data.settings).toEqual({ enabled: true, cadence: 'weekly', hour: 6, weekday: 0, keep: 8 });
    expect((await app.inject({ method: 'PUT', url: '/api/admin/bookmark-export', headers: { cookie }, payload: { enabled: true, cadence: 'daily', hour: 30, weekday: 0, keep: 8 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/admin/bookmark-export/run', headers: { cookie } })).statusCode).toBe(400);

    const token = (await app.inject({ method: 'POST', url: '/api/admin/tokens', headers: { cookie }, payload: { name: 'All', scopes: ['*'] } })).json().data.token;
    expect((await app.inject({ method: 'GET', url: '/api/admin/bookmark-export', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
  });
});

describe('backup center WebDAV file helpers', () => {
  it('creates the folder, uploads with basic auth, deletes, and rejects path tricks', async () => {
    const { createBackupCenterService } = await import('../src/services/backup-center.service.js');
    const repo = new MemoryRepository(false);
    const calls: Array<{ url: string; method: string; auth: string }> = [];
    const request = vi.fn(async (url: string, options: any) => {
      calls.push({ url, method: options.method, auth: options.headers.authorization });
      return { statusCode: options.method === 'MKCOL' ? 405 : options.method === 'DELETE' ? 404 : 201, headers: {}, body: Buffer.alloc(0) };
    });
    const center = createBackupCenterService({ repo, encryptionKey, adapters: {} as any, request: request as any });
    expect(await center.isWebDavConfigured()).toBe(false);
    await center.saveWebDavConfig({ url: 'https://dav.example/remote.php/dav/files/me', username: 'me', password: 'secret' });
    expect(await center.isWebDavConfigured()).toBe(true);

    await center.writeWebDavFile('bookmarks', 'bookmarks-latest.html', Buffer.from('<html>'), 'text/html');
    await center.deleteWebDavFile('bookmarks', 'bookmarks-old.html');

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'MKCOL https://dav.example/remote.php/dav/files/me/nono/',
      'MKCOL https://dav.example/remote.php/dav/files/me/nono/bookmarks/',
      'PUT https://dav.example/remote.php/dav/files/me/nono/bookmarks/bookmarks-latest.html',
      'DELETE https://dav.example/remote.php/dav/files/me/nono/bookmarks/bookmarks-old.html',
    ]);
    expect(calls[2].auth).toBe(`Basic ${Buffer.from('me:secret').toString('base64')}`);
    await expect(center.writeWebDavFile('bookmarks', '../batches/index.json', Buffer.alloc(0), 'text/plain')).rejects.toThrow('Invalid WebDAV file name');
    await expect(center.deleteWebDavFile('../', 'x.html')).rejects.toThrow('Invalid WebDAV file name');
  });
});
