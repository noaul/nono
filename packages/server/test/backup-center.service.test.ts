import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../src/services/repository.js';
import {
  BACKUP_MODULES,
  createBackupCenterService,
  type BackupModule,
  type BackupModuleAdapter,
} from '../src/services/backup-center.service.js';

const encryptionKey = '1'.repeat(64);

describe('backup center service', () => {
  let repo: MemoryRepository;
  let remote: Map<string, Buffer>;
  let request: ReturnType<typeof vi.fn>;
  let restoreCalls: Array<{ module: BackupModule; body: string }>;
  let adapters: Record<BackupModule, BackupModuleAdapter>;

  beforeEach(() => {
    repo = new MemoryRepository(false);
    remote = new Map();
    restoreCalls = [];
    request = vi.fn(async (url: string, options: { method?: string; body?: string | Buffer } = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      if (method === 'MKCOL') return { statusCode: 201, headers: {}, body: Buffer.alloc(0) };
      if (method === 'PUT') {
        remote.set(url, Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body || ''));
        return { statusCode: 201, headers: {}, body: Buffer.alloc(0) };
      }
      if (method === 'GET') {
        const body = remote.get(url);
        return { statusCode: body ? 200 : 404, headers: {}, body: body || Buffer.alloc(0) };
      }
      if (method === 'DELETE') {
        remote.delete(url);
        return { statusCode: 204, headers: {}, body: Buffer.alloc(0) };
      }
      return { statusCode: 405, headers: {}, body: Buffer.alloc(0) };
    });
    adapters = Object.fromEntries(BACKUP_MODULES.map((module) => [module, {
      module,
      extension: module === 'nodesk' ? 'tar.gz' : 'json',
      contentType: module === 'nodesk' ? 'application/gzip' : 'application/json',
      export: vi.fn(async () => Buffer.from(`snapshot:${module}`)),
      validate: vi.fn(async (body: Buffer) => {
        if (!body.length) throw new Error(`${module} backup is empty`);
      }),
      restore: vi.fn(async (_userId: number, body: Buffer) => {
        restoreCalls.push({ module, body: body.toString() });
      }),
    }])) as Record<BackupModule, BackupModuleAdapter>;
  });

  function service() {
    return createBackupCenterService({
      repo,
      encryptionKey,
      sourceCommit: 'abcdef123456',
      adapters,
      request,
      now: () => new Date('2026-08-14T12:34:56.000Z'),
    });
  }

  it('stores one masked WebDAV connection and never accepts custom module paths', async () => {
    const center = service();
    const saved = await center.saveWebDavConfig({
      url: 'https://dav.example/root/',
      username: 'nono-user',
      password: 'app-password',
    });

    expect(saved).toEqual({
      url: 'https://dav.example/root/',
      username: 'nono-user',
      passwordConfigured: true,
      rootPath: '/nono/',
    });
    expect(JSON.stringify((await repo.getConfig()).settings)).not.toContain('app-password');
    expect(await center.getWebDavConfig()).toEqual(saved);
  });

  it('fans a full-site backup into fixed module directories and one checksummed batch manifest', async () => {
    const center = service();
    await center.saveWebDavConfig({ url: 'https://dav.example/root', username: 'user', password: 'secret' });

    const batch = await center.backupToWebDav(7, BACKUP_MODULES);

    expect(batch.scope).toBe('full');
    expect(Object.keys(batch.modules)).toEqual(BACKUP_MODULES);
    for (const module of BACKUP_MODULES) {
      const record = batch.modules[module];
      expect(record.path).toMatch(new RegExp(`^/nono/${module}/${module}-20260814T123456Z-[a-f0-9]{6}\\.`));
      expect(record.sha256).toBe(createHash('sha256').update(`snapshot:${module}`).digest('hex'));
      expect(remote.has(`https://dav.example/root${record.path}`)).toBe(true);
    }
    expect(remote.has(`https://dav.example/root/nono/batches/${batch.id}.json`)).toBe(true);
    expect((await center.listWebDavBatches())[0].id).toBe(batch.id);
  });

  it('keeps WebDAV batches distinct when two backups start in the same second', async () => {
    const center = service();
    await center.saveWebDavConfig({ url: 'https://dav.example/root', username: 'user', password: 'secret' });

    const first = await center.backupToWebDav(7, ['nono']);
    const second = await center.backupToWebDav(7, ['nono']);

    expect(second.id).not.toBe(first.id);
    expect(await center.listWebDavBatches()).toHaveLength(2);
    expect(remote.has(`https://dav.example/root/nono/batches/${first.id}.json`)).toBe(true);
    expect(remote.has(`https://dav.example/root/nono/batches/${second.id}.json`)).toBe(true);
  });

  it('cleans up module uploads when a WebDAV backup fails before the manifest is committed', async () => {
    const center = service();
    await center.saveWebDavConfig({ url: 'https://dav.example/root', username: 'user', password: 'secret' });
    adapters.nodesk.export = vi.fn(async () => { throw new Error('nodesk export failed'); });

    await expect(center.backupToWebDav(7, ['nono', 'nodesk'])).rejects.toThrow('nodesk export failed');

    expect([...remote.keys()].filter((url) => url.includes('/nono/nono/') || url.includes('/nono/nodesk/'))).toEqual([]);
    expect([...remote.keys()].filter((url) => url.includes('/nono/batches/'))).toEqual([]);
  });

  it('cleans up a module file when WebDAV writes it but reports an upload failure', async () => {
    const center = service();
    await center.saveWebDavConfig({ url: 'https://dav.example/root', username: 'user', password: 'secret' });
    const baseRequest = request.getMockImplementation()!;
    request.mockImplementation(async (url: string, options: { method?: string; body?: string | Buffer } = {}) => {
      if ((options.method || 'GET').toUpperCase() === 'PUT' && url.includes('/nono/nodesk/')) {
        remote.set(url, Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body || ''));
        return { statusCode: 500, headers: {}, body: Buffer.alloc(0) };
      }
      return baseRequest(url, options);
    });

    await expect(center.backupToWebDav(7, ['nono', 'nodesk'])).rejects.toThrow('upload failed');

    expect([...remote.keys()].filter((url) => url.includes('/nono/nono/') || url.includes('/nono/nodesk/'))).toEqual([]);
  });

  it('verifies remote checksums before restore and leaves live data untouched when validation fails', async () => {
    const center = service();
    await center.saveWebDavConfig({ url: 'https://dav.example/root', username: 'user', password: 'secret' });
    const batch = await center.backupToWebDav(7, ['nostar']);
    remote.set(`https://dav.example/root${batch.modules.nostar.path}`, Buffer.from('tampered'));

    await expect(center.restoreWebDavBatch(7, batch.id, ['nostar'])).rejects.toThrow('checksum');
    expect(restoreCalls).toEqual([]);
  });

  it('rejects a WebDAV manifest whose module path does not exactly match its filename', async () => {
    const center = service();
    await center.saveWebDavConfig({ url: 'https://dav.example/root', username: 'user', password: 'secret' });
    const batch = await center.backupToWebDav(7, ['nono']);
    const manifestUrl = `https://dav.example/root/nono/batches/${batch.id}.json`;
    const manifest = JSON.parse(remote.get(manifestUrl)!.toString());
    manifest.modules.nono.path = '/nono/nono/../../batches/index.json';
    remote.set(manifestUrl, Buffer.from(JSON.stringify(manifest)));

    await expect(center.restoreWebDavBatch(7, batch.id, ['nono'])).rejects.toThrow('manifest entry is invalid');
    expect(restoreCalls).toEqual([]);
  });

  it('takes safety snapshots and rolls back modules already changed when a later restore fails', async () => {
    const center = service();
    await center.saveWebDavConfig({ url: 'https://dav.example/root', username: 'user', password: 'secret' });
    const batch = await center.backupToWebDav(7, ['nono', 'nomoney']);
    let failed = false;
    adapters.nomoney.restore = vi.fn(async (_userId, body) => {
      restoreCalls.push({ module: 'nomoney', body: body.toString() });
      if (!failed && body.toString() === 'snapshot:nomoney') {
        failed = true;
        throw new Error('restore failed');
      }
    });

    await expect(center.restoreWebDavBatch(7, batch.id, ['nono', 'nomoney'])).rejects.toThrow('restore failed');

    expect(restoreCalls).toEqual([
      { module: 'nono', body: 'snapshot:nono' },
      { module: 'nomoney', body: 'snapshot:nomoney' },
      { module: 'nomoney', body: 'snapshot:nomoney' },
      { module: 'nono', body: 'snapshot:nono' },
    ]);
  });

  it('creates a local all-module bundle and restores every contained module without WebDAV', async () => {
    const center = service();

    const download = await center.createLocalBackup(7, 'all');
    expect(download.filename).toBe('nono-local-backup-20260814T123456Z.json');
    expect(download.contentType).toBe('application/json');
    expect(JSON.parse(download.body.toString())).toMatchObject({
      kind: 'nono.local-backup-bundle',
      version: 1,
      modules: Object.fromEntries(BACKUP_MODULES.map((module) => [module, { encoding: 'base64' }])),
    });

    await center.restoreLocalBackup(7, 'all', download.body);
    expect(restoreCalls.map((item) => item.module)).toEqual(BACKUP_MODULES);
  });

  it('rejects a local full-site restore when any required module is missing', async () => {
    const center = service();
    const download = await center.createLocalBackup(7, 'all');
    const bundle = JSON.parse(download.body.toString());
    delete bundle.modules.yumi;

    await expect(center.restoreLocalBackup(7, 'all', Buffer.from(JSON.stringify(bundle)))).rejects.toThrow('all backup modules');
    expect(restoreCalls).toEqual([]);
  });

  it('rejects a local module upload when its selected module does not match the artifact', async () => {
    const center = service();
    const download = await center.createLocalBackup(7, 'nostar');

    await expect(center.restoreLocalBackup(7, 'nomoney', download.body)).rejects.toThrow('does not match');
    expect(restoreCalls).toEqual([]);
  });
});
