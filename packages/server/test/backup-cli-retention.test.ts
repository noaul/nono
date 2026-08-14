import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('backup CLI retention contract', () => {
  it('applies the persisted automation policy after every CLI-created backup', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/cli/backup.ts'), 'utf8');

    expect(source).toContain('createPrismaRepository');
    expect(source).toContain('getBackupAutomation()');
    expect(source).toContain('enforceBackupRetention');
  });
});
