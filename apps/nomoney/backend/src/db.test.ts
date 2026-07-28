import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createDatabase } from './db.js';

describe('persistent database writes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('writes a transaction once through an fsynced atomic rename', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moneypulse-db-'));
    const filePath = path.join(tempDir, 'app.db');
    const db = await createDatabase({ persist: true, filePath });
    const rename = vi.spyOn(fs, 'renameSync');
    const fsync = vi.spyOn(fs, 'fsyncSync');

    db.exec('BEGIN');
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['atomic-one', '1']);
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['atomic-two', '2']);

    expect(rename).not.toHaveBeenCalled();
    db.exec('COMMIT');
    expect(rename).toHaveBeenCalledTimes(1);
    expect(fsync).toHaveBeenCalledTimes(1);

    const reopened = await createDatabase({ persist: true, filePath });
    expect(reopened.get<{ value: string }>("SELECT value FROM settings WHERE key = 'atomic-two'")?.value).toBe('2');
  });
});
