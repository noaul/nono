import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('backup center route contract', () => {
  it('exposes fixed WebDAV backup/restore and local download/upload restore endpoints', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/admin/backup-center.ts'), 'utf8');

    expect(source).toContain("'/api/admin/backup-center/webdav/config'");
    expect(source).toContain("'/api/admin/backup-center/webdav/test'");
    expect(source).toContain("'/api/admin/backup-center/webdav/history'");
    expect(source).toContain("'/api/admin/backup-center/webdav/backups'");
    expect(source).toContain("'/api/admin/backup-center/webdav/restore'");
    expect(source).toContain("'/api/admin/backup-center/local/:module'");
    expect(source).toContain("'/api/admin/backup-center/local/:module/restore'");
    expect(source).toContain('isBearerRequest');
  });
});
