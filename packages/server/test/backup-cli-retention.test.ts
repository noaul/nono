import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('backup CLI retention contract', () => {
  it('applies the persisted automation policy after every CLI-created backup', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/cli/backup.ts'), 'utf8');

    expect(source).toContain('createPrismaRepository');
    expect(source).toContain('getBackupAutomation()');
    expect(source).toContain('enforceBackupRetention');
  });

  it('keeps module evaluation pending until the backup command reports completion', async () => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-backup-cli-'));
    const originalArgv = process.argv;
    const originalBackupDir = process.env.BACKUP_DIR;
    const events: string[] = [];
    let markLogged: () => void = () => {};
    const logged = new Promise<void>((resolve) => { markLogged = resolve; });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {
      events.push('logged');
      markLogged();
    });

    try {
      process.argv = ['node', path.resolve(process.cwd(), 'src/cli/backup.ts'), 'list'];
      process.env.BACKUP_DIR = backupDir;
      await import('../src/cli/backup.ts');
      events.push('imported');
      await logged;
      expect(events).toEqual(['logged', 'imported']);
    } finally {
      log.mockRestore();
      process.argv = originalArgv;
      if (originalBackupDir === undefined) delete process.env.BACKUP_DIR;
      else process.env.BACKUP_DIR = originalBackupDir;
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  });
});
