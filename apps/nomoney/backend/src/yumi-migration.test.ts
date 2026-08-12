import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { createDatabase } from './db.js';
import { decryptSecret, encryptSecret } from './secret-crypto.js';
import { migrateYumiData, waitForDatabaseFile } from './yumi-migration.js';

const oldKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const newKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

describe('NoMoney to Yumi database migration', () => {
  test('waits for the NoMoney database during a concurrent first startup', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-yumi-source-wait-'));
    const sourcePath = path.join(directory, 'nomoney.db');
    const creation = new Promise<void>((resolve) => {
      setTimeout(() => {
        fs.writeFileSync(sourcePath, 'ready');
        resolve();
      }, 20);
    });

    await expect(waitForDatabaseFile(sourcePath, { timeoutMs: 500, pollIntervalMs: 5 })).resolves.toBeUndefined();
    await creation;
  });

  test('fails clearly when the NoMoney database never becomes available', async () => {
    const sourcePath = path.join(os.tmpdir(), `missing-nomoney-${Date.now()}.db`);

    await expect(waitForDatabaseFile(sourcePath, { timeoutMs: 20, pollIntervalMs: 5 }))
      .rejects.toThrow('NoMoney source database is unavailable after 20ms');
  });

  test('preserves IDs and relationships while re-encrypting VPS secrets', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-yumi-migration-'));
    const sourcePath = path.join(directory, 'nomoney.db');
    const targetPath = path.join(directory, 'yumi.db');
    const source = await createDatabase({ persist: true, filePath: sourcePath });
    source.run("INSERT INTO users (id, username, password_hash, email, session_version, created_at, updated_at) VALUES (7, 'owner', 'hash', 'owner@example.com', 3, '2026-01-01', '2026-01-01')");
    source.run("INSERT INTO vps (id, name, ssh_password, probe_api_key, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (11, 'nc48', ?, ?, 1000, 'USD', 'monthly', 'active', '[]', '2026-01-01', '2026-01-01')", [encryptSecret('ssh-secret', oldKey), encryptSecret('probe-secret', oldKey)]);
    source.run("INSERT INTO domains (id, domain_name, amount_minor_units, currency, billing_cycle, status, tags, created_at, updated_at) VALUES (12, 'example.com', 1200, 'USD', 'annual', 'active', '[]', '2026-01-01', '2026-01-01')");
    source.run("INSERT INTO expenses (id, asset_type, asset_id, amount_minor_units, currency, paid_at, category, created_at, updated_at) VALUES (21, 'vps', 11, 1000, 'USD', '2026-01-02', 'renewal', '2026-01-02', '2026-01-02')");
    source.run("INSERT INTO renewal_events (id, request_id, asset_type, asset_id, previous_expire_date, renewed_expire_date, expense_id, amount_minor_units, currency, status, created_at) VALUES (31, 'request-123', 'vps', 11, '2026-01-01', '2026-02-01', 21, 1000, 'USD', 'active', '2026-01-02')");
    source.run("INSERT INTO reminder_logs (id, run_id, asset_type, asset_id, due_date, days_before, sent_at, status) VALUES (41, 'run-1', 'domain', 12, '2026-02-01', 7, '2026-01-25', 'sent')");
    source.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['webdavPassword', JSON.stringify(encryptSecret('dav-secret', oldKey))]);
    source.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['webdavEncryptionKey', JSON.stringify(encryptSecret('backup-secret', oldKey))]);
    source.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['webdavPath', JSON.stringify('nomoney-backup.json.enc')]);
    source.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['webdavBackupFilename', JSON.stringify('nomoney-custom.json.enc')]);
    const sourceHashBefore = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');

    const result = await migrateYumiData({ sourcePath, targetPath, sourceEncryptionKey: oldKey, targetEncryptionKey: newKey });
    const sourceHashAfter = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
    const yumi = await createDatabase({ persist: true, filePath: targetPath, product: 'yumi' });

    expect(result).toMatchObject({ migrated: true, counts: { users: 1, vps: 1, domains: 1, expenses: 1, renewalEvents: 1, reminderLogs: 1 } });
    expect(sourceHashAfter).toBe(sourceHashBefore);
    expect(yumi.get<{ id: number }>('SELECT id FROM vps WHERE id = 11')?.id).toBe(11);
    expect(yumi.get<{ asset_id: number }>('SELECT asset_id FROM expenses WHERE id = 21')?.asset_id).toBe(11);
    expect(yumi.get<{ expense_id: number }>('SELECT expense_id FROM renewal_events WHERE id = 31')?.expense_id).toBe(21);
    const secret = yumi.get<{ ssh_password: string; probe_api_key: string }>('SELECT ssh_password, probe_api_key FROM vps WHERE id = 11');
    expect(decryptSecret(secret!.ssh_password, newKey)).toBe('ssh-secret');
    expect(decryptSecret(secret!.probe_api_key, newKey)).toBe('probe-secret');
    const settings = Object.fromEntries(yumi.all<{ key: string; value: string }>('SELECT key, value FROM settings').map((row) => [row.key, JSON.parse(row.value)]));
    expect(decryptSecret(settings.webdavPassword, newKey)).toBe('dav-secret');
    expect(decryptSecret(settings.webdavEncryptionKey, newKey)).toBe('backup-secret');
    expect(settings.webdavPath).toBe('yumi-backup.json.enc');
    expect(settings.webdavBackupFilename).toBe('yumi-backup.json.enc');

    const second = await migrateYumiData({ sourcePath, targetPath, sourceEncryptionKey: oldKey, targetEncryptionKey: newKey });
    expect(second).toMatchObject({ migrated: false, alreadyCurrent: true });
  });
});
