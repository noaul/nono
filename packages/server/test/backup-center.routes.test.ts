import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { BackupCenterService } from '../src/services/backup-center.service.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function cookieFrom(response: { headers: Record<string, string | string[] | undefined> }) {
  const value = response.headers['set-cookie'];
  return (Array.isArray(value) ? value[0] : String(value)).split(';', 1)[0];
}

describe('backup center routes', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let center: BackupCenterService;

  beforeEach(async () => {
    center = {
      getWebDavConfig: vi.fn(async () => ({ url: '', username: '', passwordConfigured: false, rootPath: '/nono/' })),
      saveWebDavConfig: vi.fn(),
      testWebDavConnection: vi.fn(),
      backupToWebDav: vi.fn(),
      listWebDavBatches: vi.fn(async () => []),
      removeWebDavBatch: vi.fn(),
      restoreWebDavBatch: vi.fn(async (_userId, batchId, modules) => ({ batchId, restored: [...(modules || [])] })),
      createLocalBackup: vi.fn(),
      restoreLocalBackup: vi.fn(async (_userId, module) => ({ restored: module === 'all' ? ['nono', 'nodesk', 'nostar', 'nomoney', 'yumi'] : [module] })),
    } as BackupCenterService;
    const repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey, backupCenterService: center } as any);
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password: 'Password2026!' },
    });
    adminCookie = cookieFrom(setup);
  });

  afterEach(async () => {
    await app.close();
  });

  it('passes a validated WebDAV restore request to the backup center service', async () => {
    const batchId = '20260814T123456Z-a1b2c3';
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/backup-center/webdav/restore',
      headers: { cookie: adminCookie },
      payload: { batchId, modules: ['nomoney', 'yumi'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ batchId, restored: ['nomoney', 'yumi'] });
    expect(center.restoreWebDavBatch).toHaveBeenCalledWith(expect.any(Number), batchId, ['nomoney', 'yumi']);
  });

  it('does not impose a small route-level quota on manual WebDAV backups', async () => {
    vi.mocked(center.backupToWebDav).mockImplementation(async (_userId, modules = ['nono', 'clipper', 'nodesk', 'nostar', 'nomoney', 'yumi']) => ({
      kind: 'nono.webdav-backup-batch',
      version: 1,
      id: `20260824T12000${vi.mocked(center.backupToWebDav).mock.calls.length}Z-a1b2c3`,
      scope: modules.length === 6 ? 'full' : 'module',
      createdAt: '2026-08-24T12:00:00.000Z',
      sourceCommit: 'test',
      modules: {},
    }));

    const responses = [];
    for (let index = 0; index < 4; index += 1) {
      responses.push(await app.inject({
        method: 'POST',
        url: '/api/admin/backup-center/webdav/backups',
        headers: { cookie: adminCookie },
        payload: { modules: ['nono'] },
      }));
    }

    expect(responses.map(response => response.statusCode)).toEqual([200, 200, 200, 200]);
  });

  it('passes the uploaded local JSON body to the selected restore adapter', async () => {
    const payload = { kind: 'nono.local-module-backup', version: 1, module: 'nostar', artifact: { body: 'test' } };
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/backup-center/local/nostar/restore',
      headers: { cookie: adminCookie },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const call = vi.mocked(center.restoreLocalBackup).mock.calls[0];
    expect(call[1]).toBe('nostar');
    expect(JSON.parse(call[2].toString())).toEqual(payload);
  });
});

/**
 * These two routes move the whole dataset — one GET exports every module, one POST overwrites them
 * — so they are the last place a stored credential should be enough. The WebDAV half of the file
 * already required a session; the local half did not, which left the most destructive pair as the
 * only ones a `*`-scoped API token could reach.
 */
describe('backup center credentials', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminCookie: string;

  beforeEach(async () => {
    const repo = new MemoryRepository(false);
    const center = {
      createLocalBackup: vi.fn(async () => ({ filename: 'backup.json', contentType: 'application/json', body: Buffer.from('{}') })),
      restoreLocalBackup: vi.fn(async () => ({ restored: ['nono'] })),
    } as unknown as BackupCenterService;
    app = await buildApp({ repo, sessionSecret, encryptionKey, backupCenterService: center } as any);
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password: 'Password2026!' },
    });
    adminCookie = cookieFrom(setup);
    adminToken = (await repo.createToken(1, 'automation', null, ['*'])).token;
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuses a full local export presented with an API token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/backup-center/local/all',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe('Backup and restore require an administrator session');
  });

  it('refuses a local restore presented with an API token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/backup-center/local/nono/restore',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { kind: 'nono.module-backup' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('still serves both to an administrator session', async () => {
    const exported = await app.inject({
      method: 'GET',
      url: '/api/admin/backup-center/local/all',
      headers: { cookie: adminCookie },
    });
    const restored = await app.inject({
      method: 'POST',
      url: '/api/admin/backup-center/local/nono/restore',
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
      payload: { kind: 'nono.module-backup' },
    });

    expect(exported.statusCode).toBe(200);
    expect(restored.statusCode).toBe(200);
  });
});
