import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoStar settings ownership', () => {
  it('leaves WebDAV, backup, and backend-sync controls to NoDesk', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/SettingsPanel.tsx'), 'utf8');

    for (const id of ['webdav', 'backup', 'backend']) {
      expect(source).not.toContain(`id: '${id}'`);
      expect(source).not.toContain(`case '${id}'`);
    }
    expect(source).not.toContain('WebDAVPanel');
    expect(source).not.toContain('BackupPanel');
    expect(source).not.toContain('BackendPanel');
  });
});
