import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupOperationGate, createBackupJobService } from '../src/services/backup-jobs.service.js';
import { runBackupJob } from '../../../apps/blog/src/app/(home)/backup-job-client';

const directories: string[] = [];
async function directory() { const path = await mkdtemp(join(tmpdir(), 'nono-jobs-test-')); directories.push(path); return path; }
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
const tick = () => new Promise(resolve => setImmediate(resolve));

describe('durable backup jobs', () => {
  it('accepts five-minute clock skew without losing deduplication at retention, restart or capacity boundaries', async () => {
    const path = await directory();
    let time = 1000;
    const options = { directory: path, retentionMs: 1, maxRecords: 1, now: () => time };
    const input = { userId: 1, requestId: '301000_restore', kind: 'restore', fingerprint: 'a' };
    let runs = 0;
    const jobs = await createBackupJobService(options);
    expect(() => jobs.submit({ ...input, requestId: '301001_too-far' }, async () => { runs++; })).toThrow(/valid/i);
    const accepted = jobs.submit(input, async () => { runs++; });
    await tick(); await tick();
    time = 1000 + 24 * 60 * 60 * 1000;
    const restarted = await createBackupJobService(options);
    expect(restarted.submit(input, async () => { runs++; }).id).toBe(accepted.id);
    expect(() => restarted.submit({ ...input, requestId: `${time}_other` }, async () => { runs++; })).toThrow(/capacity/i);
    time = 301000 + 24 * 60 * 60 * 1000;
    expect(restarted.list(1)).toHaveLength(0);
    expect(() => restarted.submit(input, async () => { runs++; })).toThrow(/expired/i);
    const restartedAgain = await createBackupJobService(options);
    expect(() => restartedAgain.submit(input, async () => { runs++; })).toThrow(/expired/i);
    expect(runs).toBe(1);
  });

  it('rejects an expired restore key after metadata pruning and restart without replay', async () => {
    const path = await directory();
    let time = 1000;
    const options = { directory: path, retentionMs: 100, now: () => time };
    let runs = 0;
    const input = { userId: 1, requestId: '1000_restore', kind: 'restore', fingerprint: 'a' };
    const jobs = await createBackupJobService(options);
    jobs.submit(input, async () => { runs++; });
    await tick(); await tick();
    time = 1000 + 24 * 60 * 60 * 1000;
    expect(jobs.list(1)).toHaveLength(0);
    const restarted = await createBackupJobService({ ...options, retentionMs: 7 * 24 * 60 * 60 * 1000 });
    expect(() => restarted.submit(input, async () => { runs++; })).toThrow(/expired/i);
    await tick();
    expect(runs).toBe(1);
  });

  it('keeps retry protection past short retention, then frees capacity only after key expiration', async () => {
    let time = 1000;
    const jobs = await createBackupJobService({ directory: await directory(), now: () => time, retentionMs: 1, maxRecords: 1 });
    const input = { userId: 1, requestId: '1000_restore', kind: 'restore', fingerprint: 'a' };
    const accepted = jobs.submit(input, async () => 'done');
    await tick(); await tick();
    time = 1002;
    expect(jobs.submit(input, async () => 'unsafe').id).toBe(accepted.id);
    expect(() => jobs.submit({ ...input, requestId: '1002_other' }, async () => {})).toThrow(/capacity/i);
    time = 1000 + 24 * 60 * 60 * 1000;
    expect(jobs.list(1)).toHaveLength(0);
    expect(() => jobs.submit(input, async () => 'unsafe')).toThrow(/expired/i);
    jobs.submit({ ...input, requestId: `${time}_new` }, async () => 'new');
    await tick(); await tick();
    expect(jobs.list(1)).toHaveLength(1);
  });

  it('accepts keys from a browser clock one minute ahead and never replays a lost 202 after the browser retry window', async () => {
    let time = 1000;
    let runs = 0;
    let attempts = 0;
    const jobs = await createBackupJobService({ directory: await directory(), now: () => time, retentionMs: 1 });
    await expect(runBackupJob('/restore', { method: 'POST' }, () => {}, {
      now: () => time + 60000,
      wait: async () => { await tick(); await tick(); time += 24 * 60 * 60 * 1000; jobs.list(1); },
      fetch: async (_url, init) => {
        attempts++;
        const job = jobs.submit({ userId: 1, requestId: new Headers(init?.headers).get('idempotency-key')!, kind: 'restore', fingerprint: 'a' }, async () => { runs++; });
        if (attempts === 1) throw new Error('lost 202');
        return new Response(JSON.stringify({ data: job }), { status: 202 });
      },
    })).rejects.toThrow(/状态未知.*任务记录/);
    expect(attempts).toBe(1);
    expect(runs).toBe(1);
  });

  it('rejects capacity pressure instead of forgetting a still-valid restore key, including after restart', async () => {
    const path = await directory();
    const options = { directory: path, maxRecords: 1, retentionMs: 100, now: () => 1000 };
    const input = { userId: 1, requestId: '1000_restore', kind: 'restore', fingerprint: 'a' };
    let runs = 0;
    const jobs = await createBackupJobService(options);
    const accepted = jobs.submit(input, async () => { runs++; });
    await tick(); await tick();
    expect(() => jobs.submit({ ...input, requestId: '1000_other' }, async () => {})).toThrow(/capacity/i);
    const restarted = await createBackupJobService(options);
    expect(restarted.submit(input, async () => { runs++; }).id).toBe(accepted.id);
    await tick();
    expect(runs).toBe(1);
  });
  it('accepts without awaiting work, deduplicates requests, and excludes all overlapping operations', async () => {
    const gate = new BackupOperationGate();
    const jobs = await createBackupJobService({ directory: await directory(), gate });
    let finish!: (value: { restored: string[] }) => void;
    const work = new Promise<{ restored: string[] }>(resolve => { finish = resolve; });
    const input = { userId: 1, requestId: `${Date.now()}_one`, kind: 'local-restore', fingerprint: 'same' };
    const accepted = jobs.submit(input, () => work);
    expect(accepted.status).toBe('queued');
    expect(gate.busy).toBe(true);
    expect(jobs.submit(input, async () => { throw new Error('must not run'); }).id).toBe(accepted.id);
    expect(() => jobs.submit({ ...input, fingerprint: 'changed' }, () => work)).toThrow(/request/i);
    expect(() => jobs.submit({ ...input, requestId: `${Date.now()}_two` }, () => work)).toThrow(/progress/i);
    await expect(gate.runExclusive(async () => 'legacy restore')).rejects.toMatchObject({ statusCode: 409 });
    finish({ restored: ['nono'] });
    await tick(); await tick();
    expect(jobs.get(accepted.id, 1)).toMatchObject({ status: 'completed', result: { restored: ['nono'] } });
    expect(() => jobs.get(accepted.id, 2)).toThrow(/not found/i);
    expect(gate.busy).toBe(false);
  });

  it('persists failed and interrupted states without rerunning destructive work', async () => {
    const path = await directory();
    const jobs = await createBackupJobService({ directory: path });
    const requestId = `${Date.now()}_failure`;
    const failed = jobs.submit({ userId: 1, requestId, kind: 'restore', fingerprint: 'a' }, async () => { throw new Error('rollback failed'); });
    await tick(); await tick();
    expect(jobs.get(failed.id, 1)).toMatchObject({ status: 'failed', error: 'rollback failed' });
    const metadata = JSON.parse(await readFile(join(path, `${failed.id}.json`), 'utf8'));
    metadata.status = 'running';
    await writeFile(join(path, `${failed.id}.json`), JSON.stringify(metadata));
    const restarted = await createBackupJobService({ directory: path });
    expect(restarted.get(failed.id, 1)).toMatchObject({ status: 'interrupted' });
    expect(restarted.submit({ userId: 1, requestId, kind: 'restore', fingerprint: 'a' }, async () => 'unsafe replay').status).toBe('interrupted');
  });

  it('stores downloadable artifacts on disk and bounds records and total retained bytes', async () => {
    const path = await directory();
    const jobs = await createBackupJobService({ directory: path, maxRecords: 2, maxArtifactBytes: 12 });
    const first = jobs.submit({ userId: 1, requestId: `${Date.now()}_first`, kind: 'download', fingerprint: 'a' }, async () => ({ filename: 'backup.json', contentType: 'application/json', body: Buffer.from('{"a":1}') }));
    expect(() => jobs.download(first.id, 1)).toThrow(/complete/i);
    await tick(); await tick();
    expect(jobs.get(first.id, 1)).toMatchObject({ status: 'completed', downloadAvailable: true });
    const artifact = jobs.download(first.id, 1);
    expect(await readFile(artifact.path, 'utf8')).toBe('{"a":1}');
    expect(JSON.stringify(jobs.get(first.id, 1))).not.toContain('body');
    expect(() => jobs.download(first.id, 2)).toThrow(/not found/i);
    const second = jobs.submit({ userId: 1, requestId: `${Date.now()}_second`, kind: 'download', fingerprint: 'a' }, async () => ({ filename: 'second.json', contentType: 'application/json', body: Buffer.from('{"b":2}') }));
    await tick(); await tick();
    expect(jobs.get(first.id, 1).downloadAvailable).toBe(false);
    expect(jobs.get(second.id, 1).downloadAvailable).toBe(true);
    expect(() => jobs.submit({ userId: 1, requestId: `${Date.now()}_third`, kind: 'backup', fingerprint: 'a' }, async () => ({ ok: true }))).toThrow(/capacity/i);
    await tick(); await tick();
    expect(jobs.list(1)).toHaveLength(2);
    expect((await readdir(path)).filter(name => name.endsWith('.json'))).toHaveLength(2);
  });
});
