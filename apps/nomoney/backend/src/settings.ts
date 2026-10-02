import type { Router } from 'express';
import { z } from 'zod';
import type { AppContext, Currency } from './types.js';
import { currencies } from './utils.js';
import { asyncHandler, parseBody } from './http.js';
import { decryptSecret, encryptSecret } from './secret-crypto.js';

export interface Settings {
  reminderDays: number[];
  reminderEnabled: boolean;
  autoRenewEnabled: boolean;
  defaultCurrency: Currency;
  timezone: string;
  language: 'zh' | 'en';
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavPath: string;
  webdavFolderPath: string;
  webdavBackupFilename: string;
  webdavEncryptionKey: string;
  outageAlertsEnabled: boolean;
  diskAlertPercent: number;
}

/** Stored encrypted and never returned by the API. */
export const sensitiveSettingKeys = ['webdavPassword', 'webdavEncryptionKey'] as const;
/**
 * Notification channels moved to NoNo. These keys may still hold the values a product used before;
 * NoNo reads them once through /internal/notifications/legacy-channels to import them.
 */
const legacyEncryptedKeys = ['telegramBotToken', 'barkUrl'] as const;
type SensitiveSettingKey = typeof sensitiveSettingKeys[number];

export type PublicSettings = Settings & {
  webdavPasswordSet: boolean;
  webdavEncryptionKeySet: boolean;
};

const settingsSchema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(365)).optional(),
  reminderEnabled: z.boolean().optional(),
  autoRenewEnabled: z.boolean().optional(),
  defaultCurrency: z.enum(currencies).optional(),
  timezone: z.string().trim().min(1).optional(),
  language: z.enum(['zh', 'en']).optional(),
  webdavUrl: z.string().optional(),
  webdavUsername: z.string().optional(),
  webdavPassword: z.string().optional(),
  webdavPath: z.string().optional(),
  webdavFolderPath: z.string().optional(),
  webdavBackupFilename: z.string().optional(),
  webdavEncryptionKey: z.string().optional(),
  outageAlertsEnabled: z.boolean().optional(),
  diskAlertPercent: z.number().int().min(0).max(100).optional()
});

export function registerSettingsRoutes(router: Router, context: AppContext): void {
  router.get('/settings', (_req, res) => {
    res.json({ settings: getPublicSettings(context) });
  });

  router.put(
    '/settings',
    asyncHandler(async (req, res) => {
      const body = parseBody(settingsSchema, req.body);
      const current = getSettings(context);
      for (const [key, value] of Object.entries(body)) {
        if (isSensitiveSetting(key) && value === '' && current[key]) {
          continue;
        }
        context.db.run(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, JSON.stringify(isSensitiveSetting(key) ? encryptSecret(value === null ? '' : String(value), context.encryptionKey) : value)]
        );
      }
      res.json({ settings: getPublicSettings(context) });
    })
  );
}

export function getSettings(context: AppContext): Settings {
  const rows = context.db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings = Object.fromEntries(
    rows.map((row) => {
      try {
        return [row.key, JSON.parse(row.value)];
      } catch {
        return [row.key, row.value];
      }
    })
  ) as Partial<Settings>;

  for (const key of sensitiveSettingKeys) {
    if (settings[key]) {
      settings[key] = decryptSecret(settings[key], context.encryptionKey);
    }
  }

  const defaultBackupPath = context.product === 'yumi' ? 'yumi-backup.json.enc' : 'nomoney-backup.json.enc';
  const reminderDays: number[] = Array.isArray(settings.reminderDays) ? settings.reminderDays : [30, 14, 7, 3, 1, 0];
  return {
    reminderDays: reminderDays.length ? reminderDays : [30, 14, 7, 3, 1, 0],
    reminderEnabled: settings.reminderEnabled ?? true,
    autoRenewEnabled: settings.autoRenewEnabled ?? true,
    defaultCurrency: settings.defaultCurrency ?? 'CNY',
    timezone: settings.timezone ?? 'Asia/Shanghai',
    language: settings.language ?? 'zh',
    webdavUrl: settings.webdavUrl ?? '',
    webdavUsername: settings.webdavUsername ?? '',
    webdavPassword: settings.webdavPassword ?? '',
    webdavPath: !settings.webdavPath || settings.webdavPath === 'moneypulse-backup.json' ? defaultBackupPath : settings.webdavPath,
    webdavFolderPath: settings.webdavFolderPath ?? '',
    webdavBackupFilename: settings.webdavBackupFilename ?? '',
    webdavEncryptionKey: settings.webdavEncryptionKey ?? '',
    outageAlertsEnabled: settings.outageAlertsEnabled ?? true,
    diskAlertPercent: Number(settings.diskAlertPercent ?? 90)
  };
}

export function getPublicSettings(context: AppContext): PublicSettings {
  const settings = getSettings(context);
  return {
    ...settings,
    webdavPassword: '',
    webdavEncryptionKey: '',
    webdavPasswordSet: Boolean(settings.webdavPassword),
    webdavEncryptionKeySet: Boolean(settings.webdavEncryptionKey)
  };
}

function isSensitiveSetting(key: string): key is SensitiveSettingKey {
  return (sensitiveSettingKeys as readonly string[]).includes(key);
}

export interface LegacyChannelSettings {
  email: { host: string; port: number; user: string; from: string; to: string } | null;
  webhook: { url: string } | null;
  telegram: { botToken: string; chatId: string } | null;
  bark: { url: string } | null;
}

/** The channel configuration this product used before NoNo took over notifications. */
export function getLegacyChannelSettings(context: AppContext): LegacyChannelSettings {
  const raw = Object.fromEntries(context.db.all<{ key: string; value: string }>('SELECT key, value FROM settings').map((row) => {
    try { return [row.key, JSON.parse(row.value)]; } catch { return [row.key, row.value]; }
  })) as Record<string, unknown>;
  const text = (key: string) => {
    const value = typeof raw[key] === 'string' ? String(raw[key]).trim() : '';
    return value && (legacyEncryptedKeys as readonly string[]).includes(key) ? decryptSecret(value, context.encryptionKey) : value;
  };
  const smtpTo = text('smtpTo');
  const telegramBotToken = text('telegramBotToken');
  const telegramChatId = text('telegramChatId');
  return {
    email: smtpTo ? { host: text('smtpHost'), port: Number(raw.smtpPort || 587), user: text('smtpUser'), from: text('smtpFrom'), to: smtpTo } : null,
    webhook: text('webhookUrl') ? { url: text('webhookUrl') } : null,
    telegram: telegramBotToken && telegramChatId ? { botToken: telegramBotToken, chatId: telegramChatId } : null,
    bark: text('barkUrl') ? { url: text('barkUrl') } : null
  };
}
