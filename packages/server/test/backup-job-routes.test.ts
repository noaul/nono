import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { BackupOperationGate, createBackupJobService } from '../src/services/backup-jobs.service.js';

it('accepts deferred restores, deduplicates, excludes legacy mutations and protects polling/artifacts with sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nono-job-route-'));
  const gate = new BackupOperationGate();
  const jobs = await createBackupJobService({ directory, gate });
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const repo = new MemoryRepository(false);
  const app = await buildApp({ repo, sessionSecret: 'test-session-secret-that-is-long-enough', backupJobService: jobs, backupOperationGate: gate,
    backupCenterService: { restoreLocalBackup: async () => { await pending; return { restored: ['nono'] }; }, createLocalBackup: async () => ({ body: Buffer.from('{}'), filename: 'backup.json', contentType: 'application/json' }) },
  } as any);
  try {
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password: 'Password2026!' } });
    const cookie = String(setup.headers['set-cookie']).split(';')[0];
    const request = { method: 'POST' as const, url: '/api/admin/backup-center/local/nono/restore', headers: { cookie, 'idempotency-key': `${Date.now()}_restore-one` }, payload: {} };
    const accepted = await Promise.race([app.inject(request), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('route waited for restore instead of accepting a job')), 500))]);
    expect(accepted.statusCode).toBe(202);
    const id = accepted.json().data.id;
    expect((await app.inject(request)).json().data.id).toBe(id);
    expect((await app.inject({ ...request, headers: { cookie, 'idempotency-key': `${Date.now()}_restore-two` } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: '/api/admin/backups/20260906T120000Z', headers: { cookie } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/admin/backups', headers: { cookie } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: '/api/admin/backups/automation', headers: { cookie }, payload: { enabled: true, cadence: 'daily', hour: 3, weekday: 0, retentionDays: 30, maxBackups: 7 } })).statusCode).toBe(409);
    const url = `/api/admin/backup-center/jobs/${id}`;
    expect((await app.inject({ url })).statusCode).toBe(401);
    const token = (await repo.createToken(1, 'automation', null, ['*'])).token;
    expect((await app.inject({ url, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
    expect((await app.inject({ url, headers: { cookie } })).json().data.status).toMatch(/queued|running/);
    finish();
    await new Promise(resolve => setImmediate(resolve));
    expect((await app.inject({ url, headers: { cookie } })).json().data).toMatchObject({ status: 'completed', result: { restored: ['nono'] } });
    const download = await app.inject({ method: 'POST', url: '/api/admin/backup-center/local/nono', headers: { cookie, 'idempotency-key': `${Date.now()}_download-one` } });
    expect(download.statusCode).toBe(202);
    await new Promise(resolve => setImmediate(resolve));
    const artifactUrl = `/api/admin/backup-center/jobs/${download.json().data.id}/download`;
    expect((await app.inject({ url: artifactUrl })).statusCode).toBe(401);
    expect((await app.inject({ url: artifactUrl, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
    const artifact = await app.inject({ url: artifactUrl, headers: { cookie } });
    expect(artifact.body).toBe('{}');
    expect(artifact.headers['cache-control']).toBe('no-store');
    expect((await app.inject({ ...request, headers: { cookie } })).statusCode).toBe(400);
    expect((await app.inject({ ...request, headers: { cookie, 'idempotency-key': 'legacy-key' } })).statusCode).toBe(400);
    expect((await app.inject({ ...request, headers: { cookie, 'idempotency-key': `${Date.now() + 600000}_future` } })).statusCode).toBe(400);
    expect((await app.inject({ ...request, headers: { cookie, 'idempotency-key': `${Date.now() - 86400000}_expired` } })).statusCode).toBe(410);
  } finally { finish(); await app.close(); await rm(directory, { recursive: true, force: true }); }
});
