import type { AppContext } from './types.js';
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret-crypto.js';
import { sensitiveSettingKeys } from './settings.js';

const settingSecrets = sensitiveSettingKeys;

export function migrateStoredSecrets(context: AppContext): number {
  let migrated = 0;

  const subscriptions = context.db.all<{ id: number; license_key: string | null }>(
    'SELECT id, license_key FROM subscriptions'
  );
  for (const subscription of subscriptions) {
    if (!subscription.license_key || !isEncryptedSecret(subscription.license_key)) continue;
    context.db.run('UPDATE subscriptions SET license_key = ? WHERE id = ?', [
      decryptSecret(subscription.license_key, context.encryptionKey),
      Number(subscription.id)
    ]);
    migrated += 1;
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
