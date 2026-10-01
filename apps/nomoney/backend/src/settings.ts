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
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpTo: string;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavPath: string;
  webdavFolderPath: string;
  webdavBackupFilename: string;
  webdavEncryptionKey: string;
  webhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
  barkUrl: string;
  outageAlertsEnabled: boolean;
  diskAlertPercent: number;
}

/** Stored encrypted and never returned by the API. */
export const sensitiveSettingKeys = ['webdavPassword', 'webdavEncryptionKey', 'telegramBotToken', 'barkUrl'] as const;
type SensitiveSettingKey = typeof sensitiveSettingKeys[number];

export type PublicSettings = Settings & {
  webdavPasswordSet: boolean;
  webdavEncryptionKeySet: boolean;
  telegramBotTokenSet: boolean;
  barkUrlSet: boolean;
};

const settingsSchema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(365)).optional(),
  reminderEnabled: z.boolean().optional(),
  autoRenewEnabled: z.boolean().optional(),
  defaultCurrency: z.enum(currencies).optional(),
  timezone: z.string().trim().min(1).optional(),
  language: z.enum(['zh', 'en']).optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().optional(),
  smtpFrom: z.string().optional(),
  smtpTo: z.string().optional(),
  webdavUrl: z.string().optional(),
  webdavUsername: z.string().optional(),
  webdavPassword: z.string().optional(),
  webdavPath: z.string().optional(),
  webdavFolderPath: z.string().optional(),
  webdavBackupFilename: z.string().optional(),
  webdavEncryptionKey: z.string().optional(),
  webhookUrl: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).optional(),
  telegramBotToken: z.string().trim().max(200).optional(),
  telegramChatId: z.string().trim().max(100).optional(),
  barkUrl: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).optional(),
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
          [key, JSON.stringify(isSensitiveSetting(key) ? encryptSecret(String(value), context.encryptionKey) : value)]
        );
      }
      res.json({ settings: getPublicSettings(context) });
    })
  );

  router.post(
    '/settings/test-email',
    asyncHandler(async (_req, res) => {
      const settings = getSettings(context);
      await context.mailer.send({
        to: settings.smtpTo,
        from: settings.smtpFrom,
        subject: `${context.product === 'yumi' ? 'Yumi' : 'NoMoney'} test email`,
        text: `${context.product === 'yumi' ? 'Yumi' : 'NoMoney'} email delivery is configured.`
      });
      res.status(204).end();
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
    smtpHost: settings.smtpHost ?? '',
    smtpPort: Number(settings.smtpPort ?? 587),
    smtpUser: settings.smtpUser ?? '',
    smtpFrom: settings.smtpFrom ?? '',
    smtpTo: settings.smtpTo ?? '',
    webdavUrl: settings.webdavUrl ?? '',
    webdavUsername: settings.webdavUsername ?? '',
    webdavPassword: settings.webdavPassword ?? '',
    webdavPath: !settings.webdavPath || settings.webdavPath === 'moneypulse-backup.json' ? defaultBackupPath : settings.webdavPath,
    webdavFolderPath: settings.webdavFolderPath ?? '',
    webdavBackupFilename: settings.webdavBackupFilename ?? '',
    webdavEncryptionKey: settings.webdavEncryptionKey ?? '',
    webhookUrl: settings.webhookUrl ?? '',
    telegramBotToken: settings.telegramBotToken ?? '',
    telegramChatId: settings.telegramChatId ?? '',
    barkUrl: settings.barkUrl ?? '',
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
    telegramBotToken: '',
    barkUrl: '',
    webdavPasswordSet: Boolean(settings.webdavPassword),
    webdavEncryptionKeySet: Boolean(settings.webdavEncryptionKey),
    telegramBotTokenSet: Boolean(settings.telegramBotToken),
    barkUrlSet: Boolean(settings.barkUrl)
  };
}

function isSensitiveSetting(key: string): key is SensitiveSettingKey {
  return (sensitiveSettingKeys as readonly string[]).includes(key);
}
