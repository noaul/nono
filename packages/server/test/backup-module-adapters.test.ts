import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackupModuleAdapters } from '../src/services/backup-module-adapters.js';

describe('backup module adapters', () => {
  it('exports and restores NoMoney and Yumi through protected product-scoped internal endpoints', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || 'GET') === 'GET') {
        return new Response(JSON.stringify({ version: 2, product: url.includes(':2040') ? 'yumi' : 'nomoney', rows: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, counts: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const adapters = createBackupModuleAdapters({
      prisma: {} as never,
      encryptionKey: '1'.repeat(64),
      nodeskContentDir: 'unused',
      internalToken: 'internal-secret',
      noMoneyPort: 2030,
      yumiPort: 2040,
      fetch,
    });

    const noMoney = await adapters.nomoney.export(1);
    const yumi = await adapters.yumi.export(1);
    await adapters.nomoney.validate(noMoney);
    await adapters.yumi.restore(1, yumi);

    expect(JSON.parse(noMoney.toString())).toMatchObject({ kind: 'nono.product-backup', module: 'nomoney' });
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:2030/api/internal/backup', expect.objectContaining({
      headers: expect.objectContaining({ 'x-nono-internal-token': 'internal-secret' }),
    }));
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:2040/api/internal/backup/restore', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"product":"yumi"'),
    }));
  });

  it('rejects a product payload selected for the wrong module before issuing a restore request', async () => {
    const fetch = vi.fn();
    const adapters = createBackupModuleAdapters({
      prisma: {} as never,
      encryptionKey: '1'.repeat(64),
      nodeskContentDir: 'unused',
      internalToken: 'internal-secret',
      fetch,
    });
    const wrong = Buffer.from(JSON.stringify({
      kind: 'nono.product-backup',
      version: 1,
      module: 'yumi',
      payload: { version: 2, product: 'yumi' },
    }));

    await expect(adapters.nomoney.restore(1, wrong)).rejects.toThrow('NoMoney backup');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects NoDesk archives containing links or an excessive expanded size', async () => {
    const linkRunner = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes('-tvzf')
        ? 'lrwxrwxrwx owner/group 0 2026-08-23 00:00 public/latest -> /etc/passwd\n'
        : 'public/latest\n',
      stderr: '',
    }));
    const linkAdapters = createBackupModuleAdapters({
      prisma: {} as never,
      encryptionKey: '1'.repeat(64),
      nodeskContentDir: 'unused',
      run: linkRunner,
    });

    await expect(linkAdapters.nodesk.validate(Buffer.from('archive'))).rejects.toThrow('unsupported entry type');

    const oversizedRunner = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes('-tvzf')
        ? `-rw-r--r-- owner/group ${512 * 1024 * 1024 + 1} 2026-08-23 00:00 public/huge.bin\n`
        : 'public/huge.bin\n',
      stderr: '',
    }));
    const oversizedAdapters = createBackupModuleAdapters({
      prisma: {} as never,
      encryptionKey: '1'.repeat(64),
      nodeskContentDir: 'unused',
      run: oversizedRunner,
    });

    await expect(oversizedAdapters.nodesk.validate(Buffer.from('archive'))).rejects.toThrow('expanded size');
  });

  it('accepts the harmless archive root entry emitted by tar', async () => {
    const run = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes('-tvzf')
        ? [
            'drwxr-xr-x owner/group 0 2026-08-24 00:00 ./',
            'drwxr-xr-x owner/group 0 2026-08-24 00:00 ./public/',
            '-rw-r--r-- owner/group 12 2026-08-24 00:00 ./public/index.html',
          ].join('\n')
        : ['./', './public/', './public/index.html'].join('\n'),
      stderr: '',
    }));
    const adapters = createBackupModuleAdapters({
      prisma: {} as never,
      encryptionKey: '1'.repeat(64),
      nodeskContentDir: 'unused',
      run,
    });

    await expect(adapters.nodesk.validate(Buffer.from('archive'))).resolves.toBeUndefined();
  });
});

describe('NoDesk archive restoration', () => {
  let root: string;
  let content: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nodesk-restore-test-'));
    content = path.join(root, 'content');
    fs.mkdirSync(content);
    fs.writeFileSync(path.join(content, 'old.md'), 'old content');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });
  function adapter() {
    return createBackupModuleAdapters({ prisma: {} as never, encryptionKey: '1'.repeat(64), nodeskContentDir: content }).nodesk;
  }
  async function archive() {
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    fs.mkdirSync(path.join(source, 'posts'));
    fs.writeFileSync(path.join(source, 'posts', 'new.md'), 'new content');
    fs.utimesSync(path.join(source, 'posts', 'new.md'), new Date('2026-01-02T03:04:05Z'), new Date('2026-01-02T03:04:05Z'));
    fs.writeFileSync(path.join(source, '.settings'), 'hidden content');
    return createBackupModuleAdapters({ prisma: {} as never, encryptionKey: '1'.repeat(64), nodeskContentDir: source }).nodesk.export(1);
  }

  it('restores a mounted directory when temporary archives are on another filesystem', async () => {
    const body = await archive();
    const rename = fs.promises.rename.bind(fs.promises);
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(from) === content || String(to) === content) throw Object.assign(new Error('mount point busy'), { code: 'EBUSY' });
      if (String(from).startsWith(content + path.sep) !== String(to).startsWith(content + path.sep)) {
        throw Object.assign(new Error('cross-device rename'), { code: 'EXDEV' });
      }
      return rename(from, to);
    });
    await expect(adapter().restore(1, body)).resolves.toBeUndefined();
    expect(fs.readdirSync(content).sort()).toEqual(['.settings', 'posts']);
    expect(fs.readFileSync(path.join(content, 'posts', 'new.md'), 'utf8')).toBe('new content');
    expect(fs.statSync(path.join(content, 'posts', 'new.md')).mtime.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(fs.readFileSync(path.join(content, '.settings'), 'utf8')).toBe('hidden content');
  });

  it('rolls back original content if installing the restored entries fails', async () => {
    const body = await archive();
    const rename = fs.promises.rename.bind(fs.promises);
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(to) === path.join(content, 'posts')) throw new Error('simulated install failure');
      return rename(from, to);
    });
    await expect(adapter().restore(1, body)).rejects.toThrow('simulated install failure');
    expect(fs.readdirSync(content)).toEqual(['old.md']);
    expect(fs.readFileSync(path.join(content, 'old.md'), 'utf8')).toBe('old content');
  });

  it('keeps current content intact when staging runs out of disk space', async () => {
    const body = await archive();
    vi.spyOn(fs.promises, 'cp').mockRejectedValue(Object.assign(new Error('disk full'), { code: 'ENOSPC' }));
    await expect(adapter().restore(1, body)).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(fs.readdirSync(content)).toEqual(['old.md']);
    expect(fs.readFileSync(path.join(content, 'old.md'), 'utf8')).toBe('old content');
  });

  it('retains recovery files if rollback also fails', async () => {
    const body = await archive();
    const rename = fs.promises.rename.bind(fs.promises);
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if ([path.join(content, 'posts'), path.join(content, 'old.md')].includes(String(to))) {
        throw new Error('simulated write failure');
      }
      return rename(from, to);
    });
    await expect(adapter().restore(1, body)).rejects.toThrow('recovery files retained');
    const retained = fs.readdirSync(content);
    expect(retained).toHaveLength(1);
    expect(fs.readFileSync(path.join(content, retained[0], 'previous', 'old.md'), 'utf8')).toBe('old content');
  });
});
