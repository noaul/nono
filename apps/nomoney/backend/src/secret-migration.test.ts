import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret-crypto.js';
import { migrateStoredSecrets } from './secret-migration.js';
import { createTestContext, describe, expect, test } from './test-utils.js';

describe('stored secret migration', () => {
  test('encrypts protected secrets, decrypts legacy license keys, and remains idempotent', async () => {
    const context = await createTestContext();
    context.db.run("UPDATE settings SET value = ? WHERE key = 'webdavPassword'", [JSON.stringify('legacy-webdav')]);
    context.db.insert(
      `INSERT INTO vps (
        name, ssh_password, probe_api_key, amount_minor_units, currency, billing_cycle,
        status, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['legacy-vps', 'legacy-ssh', 'legacy-probe', 0, 'CNY', 'annual', 'active', '[]', '2026-01-01', '2026-01-01']
    );
    context.db.insert(
      `INSERT INTO subscriptions (
        name, license_key, amount_minor_units, currency, billing_cycle,
        status, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'legacy-license',
        encryptSecret('legacy-key', context.encryptionKey),
        0,
        'CNY',
        'annual',
        'active',
        '[]',
        '2026-01-01',
        '2026-01-01'
      ]
    );

    expect(migrateStoredSecrets(context)).toBe(4);

    const protectedValues = [
      JSON.parse(context.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'webdavPassword'")!.value),
      context.db.get<{ ssh_password: string; probe_api_key: string }>('SELECT ssh_password, probe_api_key FROM vps WHERE id = 1')!.ssh_password,
      context.db.get<{ ssh_password: string; probe_api_key: string }>('SELECT ssh_password, probe_api_key FROM vps WHERE id = 1')!.probe_api_key
    ];
    expect(protectedValues.every(isEncryptedSecret)).toBe(true);
    expect(protectedValues.map((value) => decryptSecret(value, context.encryptionKey))).toEqual([
      'legacy-webdav',
      'legacy-ssh',
      'legacy-probe'
    ]);
    expect(context.db.get<{ license_key: string }>('SELECT license_key FROM subscriptions WHERE id = 1')?.license_key)
      .toBe('legacy-key');
    expect(migrateStoredSecrets(context)).toBe(0);
  });
});
