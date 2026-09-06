import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { DEFAULT_API_TOKEN_SCOPES, hasApiTokenScope, requiredApiTokenScope } from '../src/utils/api-token-scopes.js';
import { createBackupModuleAdapters } from '../src/services/backup-module-adapters.js';
import { createBackupCenterService } from '../src/services/backup-center.service.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); });

describe('retired clipping functionality', () => {
  it('never serves an existing static asset from a retired build', async () => {
    const name = `retirement-${randomUUID()}.js`;
    const directory = path.resolve(import.meta.dirname, '../../web/dist/clipper');
    await fs.mkdir(directory, { recursive: true });
    const filename = path.join(directory, name);
    const index = path.join(directory, '../index.html');
    let createdIndex = false;
    try {
      try { await fs.writeFile(index, '<main>Test navigation</main>', { flag: 'wx' }); createdIndex = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      await fs.writeFile(filename, 'retired content');
      app = await buildApp({ repo: new MemoryRepository(false), sessionSecret: 'test-session-secret-that-is-long-enough' });
      expect((await app.inject({ method: 'GET', url: `/clipper/${name}` })).statusCode).toBe(404);
    } finally {
      await fs.unlink(filename);
      if (createdIndex) await fs.unlink(index);
    }
  });
  it('does not expose the retired page or APIs even when assets from an earlier build exist', async () => {
    app = await buildApp({ repo: new MemoryRepository(false), sessionSecret: 'test-session-secret-that-is-long-enough' });
    for (const url of ['/clipper', '/clipper/', '/clipper/assets/stale.js', '/api/clipper/clips', '/api/clipper/search?q=test']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    expect((await app.inject({ method: 'POST', url: '/api/clipper/clips', payload: {} })).statusCode).toBe(404);
  });

  it('new default credentials grant bookmark assistance only', () => {
    expect(DEFAULT_API_TOKEN_SCOPES).toEqual(['bookmarks:read', 'bookmarks:write', 'ai:analyze']);
    expect(hasApiTokenScope(DEFAULT_API_TOKEN_SCOPES, requiredApiTokenScope({ method: 'POST', url: '/api/clipper/clips' } as never))).toBe(false);
  });

  it('exports only the five supported modules in a full local backup', async () => {
    const modules = createBackupModuleAdapters({ prisma: {} as never, encryptionKey: '1'.repeat(64), nodeskContentDir: '/unused' });
    for (const adapter of Object.values(modules)) {
      adapter.export = async () => Buffer.from('{}');
      adapter.validate = async () => {};
    }
    const service = createBackupCenterService({ repo: new MemoryRepository(false), encryptionKey: '1'.repeat(64), adapters: modules });
    const backup = await service.createLocalBackup(1, 'all');
    expect(Object.keys(JSON.parse(backup.body.toString()).modules)).toEqual(['nono', 'nodesk', 'nostar', 'nomoney', 'yumi']);
  });
});
