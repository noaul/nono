import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackupService } from '../src/services/backup.service.js';

const backupId = '20260718T140000Z';

function fingerprint(value: string) {
  return { size: Buffer.byteLength(value), sha256: createHash('sha256').update(value).digest('hex') };
}

describe('backup restoration', () => {
  let root: string;
  let backupDir: string;
  let nodeskContentDir: string;
  let nomoneyDataDir: string;
  let extractedDir: string;
  let extractedValues: Record<string, string>;
  let calls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }>;
  let run: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-backup-restore-'));
    backupDir = path.join(root, 'backups');
    nodeskContentDir = path.join(root, 'nodesk');
    nomoneyDataDir = path.join(root, 'nomoney');
    extractedDir = path.join(root, 'extracted-source');
    for (const directory of [backupDir, nodeskContentDir, nomoneyDataDir, extractedDir]) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(nodeskContentDir, 'old.md'), 'old nodesk');
    fs.writeFileSync(path.join(nomoneyDataDir, 'app.db'), 'old sqlite');

    extractedValues = {
      'postgres.dump': 'postgres-dump',
      'nodesk.tar.gz': 'nodesk-archive',
      'nomoney.db': 'new sqlite',
    };
    const innerManifest = {
      kind: 'nono.full-backup',
      version: 1,
      id: backupId,
      createdAt: '2026-07-18T14:00:00.000Z',
      sourceCommit: 'abcdef123456',
      components: {
        postgres: { filename: 'postgres.dump', ...fingerprint(extractedValues['postgres.dump']) },
        nodesk: { filename: 'nodesk.tar.gz', ...fingerprint(extractedValues['nodesk.tar.gz']) },
        nomoney: { filename: 'nomoney.db', ...fingerprint(extractedValues['nomoney.db']) },
      },
    };
    extractedValues['manifest.json'] = `${JSON.stringify(innerManifest, null, 2)}\n`;

    const archiveValue = 'full-archive';
    const filename = `nono-backup-${backupId}.tar.gz`;
    fs.writeFileSync(path.join(backupDir, filename), archiveValue);
    fs.writeFileSync(path.join(backupDir, `nono-backup-${backupId}.json`), JSON.stringify({
      ...innerManifest,
      filename,
      ...fingerprint(archiveValue),
      status: 'verified',
      components: ['postgres', 'nodesk', 'nomoney'],
      componentRecords: innerManifest.components,
    }));

    calls = [];
    run = vi.fn(async (command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) => {
      calls.push({ command, args: [...args], env: options.env });
      if (command === 'tar' && args[0] === '-tzf') {
        return { stdout: './manifest.json\n./postgres.dump\n./nodesk.tar.gz\n./nomoney.db\n', stderr: '' };
      }
      if (command === 'tar' && args[0] === '-xzf' && args[1].includes(`nono-backup-${backupId}`)) {
        const destination = args[args.indexOf('-C') + 1];
        for (const [filename, value] of Object.entries(extractedValues)) fs.writeFileSync(path.join(destination, filename), value);
        return { stdout: '', stderr: '' };
      }
      if (command === 'tar' && args[0] === '-xzf' && args[1].endsWith('nodesk.tar.gz')) {
        const destination = args[args.indexOf('-C') + 1];
        fs.writeFileSync(path.join(destination, 'restored.md'), 'restored nodesk');
        return { stdout: '', stderr: '' };
      }
      if (command === 'pg_restore' && args.includes('--list')) return { stdout: 'toc\n', stderr: '' };
      if (command === 'sqlite3') return { stdout: 'ok\n', stderr: '' };
      return { stdout: '', stderr: '' };
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeService() {
    return createBackupService({
      backupDir,
      nodeskContentDir,
      nomoneyDataDir,
      databaseUrl: 'postgresql://nono:secret-password@postgres:5432/nono?schema=public',
      run,
    });
  }

  it('verifies archive paths and every component before restoration', async () => {
    const service = makeService();

    await expect(service.verify(backupId)).resolves.toMatchObject({ id: backupId });
    expect(calls.some((call) => call.command === 'pg_restore' && call.args.includes('--list'))).toBe(true);
    expect(calls.some((call) => call.command === 'sqlite3')).toBe(true);

    extractedValues['nomoney.db'] = 'tampered sqlite';
    await expect(service.verify(backupId)).rejects.toThrow('nomoney component checksum mismatch');
  });

  it('restores PostgreSQL, NoDesk and NoMoney only after verification', async () => {
    const service = makeService();

    await expect(service.restore(backupId)).resolves.toMatchObject({ id: backupId });

    const restore = calls.find((call) => call.command === 'pg_restore' && !call.args.includes('--list'));
    expect(restore?.args).toEqual(expect.arrayContaining(['--clean', '--if-exists', '--exit-on-error', '--no-owner', '--no-acl', '--dbname=nono']));
    expect(restore?.args.join(' ')).not.toContain('secret-password');
    expect(restore?.env?.PGPASSWORD).toBe('secret-password');
    expect(fs.existsSync(path.join(nodeskContentDir, 'old.md'))).toBe(false);
    expect(fs.readFileSync(path.join(nodeskContentDir, 'restored.md'), 'utf8')).toBe('restored nodesk');
    expect(fs.readFileSync(path.join(nomoneyDataDir, 'app.db'), 'utf8')).toBe('new sqlite');
  });

  it('drills a restore into isolated temporary targets without touching production data', async () => {
    const service = makeService();

    await expect(service.drill(backupId)).resolves.toMatchObject({ id: backupId });

    const createdb = calls.find((call) => call.command === 'createdb');
    const restore = calls.find((call) => call.command === 'pg_restore' && !call.args.includes('--list'));
    const dropdb = calls.find((call) => call.command === 'dropdb');
    expect(createdb?.args.at(-1)).toMatch(/^nono_drill_/);
    expect(restore?.args).toContain(`--dbname=${createdb?.args.at(-1)}`);
    expect(dropdb?.args).toEqual(['--if-exists', createdb?.args.at(-1)]);
    expect(fs.readFileSync(path.join(nodeskContentDir, 'old.md'), 'utf8')).toBe('old nodesk');
    expect(fs.readFileSync(path.join(nomoneyDataDir, 'app.db'), 'utf8')).toBe('old sqlite');
  });
});
