import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'Password2026!';

function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }) {
  const value = response.headers['set-cookie'];
  return (Array.isArray(value) ? value[0] : String(value)).split(';', 1)[0];
}

describe('global backups', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;
  let adminCookie: string;
  let memberCookie: string;
  let tempDir: string;
  let archivePath: string;
  let backupService: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    resolveDownload: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-backup-route-'));
    archivePath = path.join(tempDir, 'nono-backup-20260718T120000Z.tar.gz');
    fs.writeFileSync(archivePath, 'verified-backup');

    backupService = {
      list: vi.fn().mockResolvedValue([
        {
          id: '20260718T120000Z',
          createdAt: '2026-07-18T12:00:00.000Z',
          size: 15,
          sha256: 'abc123',
          components: ['postgres', 'nodesk', 'nomoney', 'yumi'],
        },
      ]),
      create: vi.fn().mockResolvedValue({
        id: '20260718T120000Z',
        createdAt: '2026-07-18T12:00:00.000Z',
        size: 15,
        sha256: 'abc123',
        components: ['postgres', 'nodesk', 'nomoney', 'yumi'],
      }),
      resolveDownload: vi.fn().mockResolvedValue({
        path: archivePath,
        filename: path.basename(archivePath),
        size: 15,
      }),
      remove: vi.fn().mockResolvedValue(true),
    };

    repo = new MemoryRepository(true);
    await repo.updateConfig({ allowRegistration: true });
    app = await buildApp({ repo, sessionSecret, encryptionKey, backupService } as any);
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password },
    });
    adminCookie = sessionCookie(setup);
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'member', email: 'member@nono.test', displayName: 'Member', password },
    });
    const memberLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'member', password },
    });
    memberCookie = sessionCookie(memberLogin);
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists verified backups for administrators', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/backups',
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.backups).toEqual([
      expect.objectContaining({ id: '20260718T120000Z', components: ['postgres', 'nodesk', 'nomoney', 'yumi'] }),
    ]);
    expect(backupService.list).toHaveBeenCalledOnce();
  });

  it('rejects backup access from non-admin users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/backups',
      headers: { cookie: memberCookie },
    });

    expect(response.statusCode).toBe(403);
    expect(backupService.list).not.toHaveBeenCalled();
  });

  it('creates one full backup at a time', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.backup.id).toBe('20260718T120000Z');
    expect(response.json().data.automation.status.lastSuccessAt).toEqual(expect.any(String));
    expect(backupService.create).toHaveBeenCalledOnce();

    const automation = await app.inject({
      method: 'GET',
      url: '/api/admin/backups/automation',
      headers: { cookie: adminCookie },
    });
    expect(automation.json().data.status.lastSuccessAt).toEqual(expect.any(String));
  });

  it('reads and updates the automatic backup policy for administrators', async () => {
    const initial = await app.inject({
      method: 'GET',
      url: '/api/admin/backups/automation',
      headers: { cookie: adminCookie },
    });

    expect(initial.statusCode).toBe(200);
    expect(initial.json().data.settings).toMatchObject({
      enabled: false,
      cadence: 'daily',
      hour: 3,
      weekday: 0,
      retentionDays: 30,
      maxBackups: 7,
    });

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/admin/backups/automation',
      headers: { cookie: adminCookie },
      payload: {
        enabled: true,
        cadence: 'weekly',
        hour: 4,
        weekday: 1,
        retentionDays: 45,
        maxBackups: 10,
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.settings).toMatchObject({ enabled: true, cadence: 'weekly', hour: 4, weekday: 1 });
  });

  it('rejects automatic backup policy access from non-admin users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/backups/automation',
      headers: { cookie: memberCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it('downloads only a resolved managed backup archive', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/backups/20260718T120000Z/download',
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('verified-backup');
    expect(response.headers['content-disposition']).toContain('nono-backup-20260718T120000Z.tar.gz');
    expect(backupService.resolveDownload).toHaveBeenCalledWith('20260718T120000Z');
  });

  it('deletes a managed backup', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/backups/20260718T120000Z',
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.ok).toBe(true);
    expect(backupService.remove).toHaveBeenCalledWith('20260718T120000Z');
  });

  it('does not let a full-scope API token operate on whole-stack backups', async () => {
    const token = (await repo.createToken(1, 'automation', null, ['*'])).token;
    const headers = { authorization: `Bearer ${token}` };

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/admin/backups/automation', headers }),
      app.inject({ method: 'PUT', url: '/api/admin/backups/automation', headers, payload: { enabled: true } }),
      app.inject({ method: 'GET', url: '/api/admin/backups', headers }),
      app.inject({ method: 'POST', url: '/api/admin/backups', headers }),
      app.inject({ method: 'GET', url: '/api/admin/backups/20260718T120000Z/download', headers }),
      app.inject({ method: 'DELETE', url: '/api/admin/backups/20260718T120000Z', headers }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403, 403, 403, 403]);
  });
});
