import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackupService, DISABLE_RESTORED_MOBILE_DEVICES_SQL } from '../src/services/backup.service.js';

const backupId = '20260718T140000Z';

function fingerprint(value: string) {
  return { size: Buffer.byteLength(value), sha256: createHash('sha256').update(value).digest('hex') };
}

describe('backup restoration', () => {
  let root: string;
  let backupDir: string;
  let nodeskContentDir: string;
  let nomoneyDataDir: string;
  let yumiDataDir: string;
  let extractedDir: string;
  let extractedValues: Record<string, string>;
  let tarListing: string;
  let calls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }>;
  let run: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-backup-restore-'));
    backupDir = path.join(root, 'backups');
    nodeskContentDir = path.join(root, 'nodesk');
    nomoneyDataDir = path.join(root, 'nomoney');
    yumiDataDir = path.join(root, 'yumi');
    extractedDir = path.join(root, 'extracted-source');
    for (const directory of [backupDir, nodeskContentDir, nomoneyDataDir, yumiDataDir, extractedDir]) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(nodeskContentDir, 'old.md'), 'old nodesk');
    fs.writeFileSync(path.join(nomoneyDataDir, 'app.db'), 'old sqlite');
    fs.writeFileSync(path.join(yumiDataDir, 'app.db'), 'old yumi sqlite');

    writeFixture({ version: 2, yumi: true });

    calls = [];
    run = vi.fn(async (command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) => {
      calls.push({ command, args: [...args], env: options.env });
      if (command === 'tar' && args[0] === '-tzf') {
        return { stdout: tarListing, stderr: '' };
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

  /** v2 archives carried the separate Yumi database; v3 archives (Yumi retired) do not. */
  function writeFixture(options: { version: 2 | 3; yumi: boolean }) {
    extractedValues = {
      'postgres.dump': 'postgres-dump',
      'nodesk.tar.gz': 'nodesk-archive',
      'nomoney.db': 'new sqlite',
      ...(options.yumi ? { 'yumi.db': 'new yumi sqlite' } : {}),
    };
    const components: Record<string, { filename: string; size: number; sha256: string }> = {
      postgres: { filename: 'postgres.dump', ...fingerprint(extractedValues['postgres.dump']) },
      nodesk: { filename: 'nodesk.tar.gz', ...fingerprint(extractedValues['nodesk.tar.gz']) },
      nomoney: { filename: 'nomoney.db', ...fingerprint(extractedValues['nomoney.db']) },
    };
    if (options.yumi) components.yumi = { filename: 'yumi.db', ...fingerprint(extractedValues['yumi.db']) };
    const innerManifest = {
      kind: 'nono.full-backup',
      version: options.version,
      id: backupId,
      createdAt: '2026-07-18T14:00:00.000Z',
      sourceCommit: 'abcdef123456',
      components,
    };
    extractedValues['manifest.json'] = `${JSON.stringify(innerManifest, null, 2)}\n`;
    tarListing = `${Object.keys(extractedValues).map((name) => `./${name}`).join('\n')}\n`;

    const archiveValue = 'full-archive';
    const filename = `nono-backup-${backupId}.tar.gz`;
    fs.writeFileSync(path.join(backupDir, filename), archiveValue);
    fs.writeFileSync(path.join(backupDir, `nono-backup-${backupId}.json`), JSON.stringify({
      ...innerManifest,
      filename,
      ...fingerprint(archiveValue),
      status: 'verified',
      components: Object.keys(components),
      componentRecords: components,
    }));
  }

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeService() {
    return createBackupService({
      backupDir,
      nodeskContentDir,
      nomoneyDataDir,
      yumiDataDir,
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

  it('restores a v2 archive, putting its Yumi database back for the NoMoney domain merge', async () => {
    await expect(makeService().restore(backupId)).resolves.toMatchObject({ id: backupId, version: 2 });
    expect(fs.readFileSync(path.join(nomoneyDataDir, 'app.db'), 'utf8')).toBe('new sqlite');
    expect(fs.readFileSync(path.join(yumiDataDir, 'app.db'), 'utf8')).toBe('new yumi sqlite');
  });

  it('still checks the integrity of the Yumi database inside a v2 archive', async () => {
    run.mockImplementation(async (command: string, args: string[]) => {
      calls.push({ command, args: [...args] });
      if (command === 'tar' && args[0] === '-tzf') return { stdout: tarListing, stderr: '' };
      if (command === 'tar' && args[0] === '-xzf') {
        const destination = args[args.indexOf('-C') + 1];
        for (const [filename, value] of Object.entries(extractedValues)) fs.writeFileSync(path.join(destination, filename), value);
        return { stdout: '', stderr: '' };
      }
      if (command === 'sqlite3') return { stdout: args[0].endsWith('yumi.db') ? 'corrupt\n' : 'ok\n', stderr: '' };
      return { stdout: '', stderr: '' };
    });
    await expect(makeService().verify(backupId)).rejects.toThrow('Yumi SQLite integrity check failed');
    expect(fs.readFileSync(path.join(yumiDataDir, 'app.db'), 'utf8')).toBe('old yumi sqlite');
  });

  it('restores a v3 archive without touching the legacy Yumi data', async () => {
    writeFixture({ version: 3, yumi: false });
    await expect(makeService().restore(backupId)).resolves.toMatchObject({ id: backupId, version: 3, components: ['postgres', 'nodesk', 'nomoney'] });
    expect(fs.readFileSync(path.join(nomoneyDataDir, 'app.db'), 'utf8')).toBe('new sqlite');
    expect(fs.readFileSync(path.join(yumiDataDir, 'app.db'), 'utf8')).toBe('old yumi sqlite');
    expect(calls.filter((call) => call.command === 'sqlite3').map((call) => path.basename(call.args[0]))).toEqual(['nomoney.db']);
  });

  it('rejects a v3 archive that smuggles in a Yumi database or claims a Yumi component', async () => {
    writeFixture({ version: 3, yumi: false });
    tarListing += './yumi.db\n';
    await expect(makeService().verify(backupId)).rejects.toThrow('unexpected file');

    writeFixture({ version: 3, yumi: true });
    await expect(makeService().verify(backupId)).rejects.toThrow('Backup not found');
    expect(fs.readFileSync(path.join(yumiDataDir, 'app.db'), 'utf8')).toBe('old yumi sqlite');
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
    expect(fs.readFileSync(path.join(yumiDataDir, 'app.db'), 'utf8')).toBe('new yumi sqlite');
  });

  it('disables restored phone bindings right after the database restore', async () => {
    await expect(makeService().restore(backupId)).resolves.toMatchObject({ id: backupId });

    const restoreIndex = calls.findIndex((call) => call.command === 'pg_restore' && !call.args.includes('--list'));
    const disableIndex = calls.findIndex((call) => call.command === 'psql');
    expect(disableIndex).toBeGreaterThan(restoreIndex);
    const disable = calls[disableIndex];
    expect(disable.args).toEqual(expect.arrayContaining(['--set=ON_ERROR_STOP=1', '--dbname=nono', DISABLE_RESTORED_MOBILE_DEVICES_SQL]));
    expect(disable.args.join(' ')).not.toContain('secret-password');
    expect(disable.env?.PGPASSWORD).toBe('secret-password');
    expect(DISABLE_RESTORED_MOBILE_DEVICES_SQL).toContain('UPDATE "MobileDevice" SET "enabled" = false');
  });

  it('does not touch phone bindings in a drill', async () => {
    await expect(makeService().drill(backupId)).resolves.toMatchObject({ id: backupId });
    expect(calls.some((call) => call.command === 'psql')).toBe(false);
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
    expect(fs.readFileSync(path.join(yumiDataDir, 'app.db'), 'utf8')).toBe('old yumi sqlite');
  });

  it('restores content without removing the mounted NoDesk directory', async () => {
    const remove = fs.promises.rm.bind(fs.promises);
    vi.spyOn(fs.promises, 'rm').mockImplementation(async (target, options) => {
      if (String(target) === nodeskContentDir) throw Object.assign(new Error('mount point busy'), { code: 'EBUSY' });
      return remove(target, options);
    });
    await expect(makeService().restore(backupId)).resolves.toMatchObject({ id: backupId });
    expect(fs.readdirSync(nodeskContentDir)).toEqual(['restored.md']);
    expect(fs.readFileSync(path.join(nodeskContentDir, 'restored.md'), 'utf8')).toBe('restored nodesk');
  });
});
