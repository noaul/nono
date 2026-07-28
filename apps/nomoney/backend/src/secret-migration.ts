import type { AppContext } from './types.js';
import { encryptSecret, isEncryptedSecret } from './secret-crypto.js';

const assetSecrets = [
  { table: 'vps', columns: ['ssh_password', 'ssh_private_key', 'ssh_private_key_passphrase', 'probe_api_key'] },
  { table: 'subscriptions', columns: ['license_key'] }
] as const;
const settingSecrets = ['webdavPassword', 'webdavEncryptionKey'] as const;

export function migrateStoredSecrets(context: AppContext): number {
  let migrated = 0;

  for (const { table, columns } of assetSecrets) {
    const rows = context.db.all<Record<string, unknown>>(`SELECT id, ${columns.join(', ')} FROM ${table}`);
    for (const row of rows) {
      for (const column of columns) {
        const value = row[column];
        if (typeof value !== 'string' || !value || isEncryptedSecret(value)) continue;
        context.db.run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [
          encryptSecret(value, context.encryptionKey),
          Number(row.id)
        ]);
        migrated += 1;
      }
    }
  }

  for (const key of settingSecrets) {
    const row = context.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    if (!row) continue;
    const parsed = parseSettingValue(row.value);
    if (!parsed || isEncryptedSecret(parsed)) continue;
    context.db.run('UPDATE settings SET value = ? WHERE key = ?', [
      JSON.stringify(encryptSecret(parsed, context.encryptionKey)),
      key
    ]);
    migrated += 1;
  }

  return migrated;
}

function parseSettingValue(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' ? parsed : '';
  } catch {
    return value;
  }
}
