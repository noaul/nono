import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceModulePath = '../src/services/backup.service.js';

describe('backup service', () => {
  let root: string;
  let backupDir: string;
  let nodeskContentDir: string;
  let nomoneyDataDir: string;
  let calls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }>;
  let run: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-backup-service-'));
    backupDir = path.join(root, 'backups');
    nodeskContentDir = path.join(root, 'nodesk');
    nomoneyDataDir = path.join(root, 'nomoney');
    fs.mkdirSync(nodeskContentDir, { recursive: true });
    fs.mkdirSync(nomoneyDataDir, { recursive: true });
    fs.writeFileSync(path.join(nodeskContentDir, 'content.md'), '# Nodesk');
    fs.writeFileSync(path.join(nomoneyDataDir, 'app.db'), 'sqlite-database');
    calls = [];
    run = vi.fn(async (command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) => {
      calls.push({ command, args: [...args], env: options.env });
      if (command === 'pg_dump') {
        const output = args.find((argument) => argument.startsWith('--file='))?.slice('--file='.length);
        if (!output) throw new Error('pg_dump output missing');
        fs.writeFileSync(output, 'postgres-dump');
      }
      if (command === 'tar' && args.includes('-czf')) {
        const output = args[args.indexOf('-czf') + 1];
        fs.writeFileSync(output, output.includes('nodesk') ? 'nodesk-archive' : 'full-archive');
      }
      if (command === 'sqlite3') return { stdout: 'ok\n', stderr: '' };
      if (command === 'pg_restore' && args.includes('--list')) return { stdout: 'toc\n', stderr: '' };
      return { stdout: '', stderr: '' };
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function makeService() {
    const { createBackupService } = await import(serviceModulePath);
    return createBackupService({
      backupDir,
      nodeskContentDir,
      nomoneyDataDir,
      databaseUrl: 'postgresql://nono:secret-password@postgres:5432/nono?schema=public',
      sourceCommit: 'abcdef1234567890',
      now: () => new Date('2026-07-18T12:34:56.000Z'),
      run,
    });
  }

  it('creates a checksummed archive containing all persistent data', async () => {
    const service = await makeService();
    const backup = await service.create();

    expect(backup).toMatchObject({
      id: '20260718T123456Z',
      createdAt: '2026-07-18T12:34:56.000Z',
      sourceCommit: 'abcdef1234567890',
      components: ['postgres', 'nodesk', 'nomoney'],
      size: Buffer.byteLength('full-archive'),
    });
    expect(backup.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(path.join(backupDir, 'nono-backup-20260718T123456Z.tar.gz'))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'nono-backup-20260718T123456Z.json'))).toBe(true);

    const pgDump = calls.find((call) => call.command === 'pg_dump');
    expect(pgDump?.args.join(' ')).not.toContain('secret-password');
    expect(pgDump?.env).toMatchObject({
      PGHOST: 'postgres',
      PGPORT: '5432',
      PGUSER: 'nono',
      PGPASSWORD: 'secret-password',
      PGDATABASE: 'nono',
    });
    expect(calls.some((call) => call.command === 'sqlite3' && call.args.at(-1) === 'PRAGMA integrity_check;')).toBe(true);
    expect(calls.some((call) => call.command === 'pg_restore' && call.args.includes('--list'))).toBe(true);
  });

  it('lists created backups newest first', async () => {
    const service = await makeService();
    await service.create();

    await new Promise((resolve) => setTimeout(resolve, 2));
    const records = await service.list();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: '20260718T123456Z', status: 'verified' });
  });

  it('refuses to download a backup whose archive checksum changed', async () => {
    const service = await makeService();
    const backup = await service.create();
    fs.appendFileSync(path.join(backupDir, backup.filename), 'tampered');

    await expect(service.resolveDownload(backup.id)).rejects.toThrow('Backup checksum mismatch');
  });

  it('rejects path-like backup identifiers', async () => {
    const service = await makeService();

    await expect(service.resolveDownload('../outside')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.remove('../outside')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('removes the archive and its manifest together', async () => {
    const service = await makeService();
    const backup = await service.create();

    await expect(service.remove(backup.id)).resolves.toBe(true);
    expect(fs.existsSync(path.join(backupDir, backup.filename))).toBe(false);
    expect(await service.list()).toEqual([]);
  });
});
