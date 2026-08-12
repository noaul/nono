import type { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from './types.js';
import { asyncHandler, parseBody } from './http.js';
import { decryptSecret, encryptSecret } from './secret-crypto.js';

export interface Settings {
  reminderDays: number[];
  reminderEnabled: boolean;
  defaultCurrency: 'CNY' | 'USD' | 'GBP' | 'EUR' | 'CAD';
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
}

export type PublicSettings = Settings & {
  webdavPasswordSet: boolean;
  webdavEncryptionKeySet: boolean;
};

const settingsSchema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(365)).optional(),
  reminderEnabled: z.boolean().optional(),
  defaultCurrency: z.enum(['CNY', 'USD', 'GBP', 'EUR', 'CAD']).optional(),
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
  webdavEncryptionKey: z.string().optional()
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

  for (const key of ['webdavPassword', 'webdavEncryptionKey'] as const) {
    if (settings[key]) {
      settings[key] = decryptSecret(settings[key], context.encryptionKey);
    }
  }

  const defaultBackupPath = context.product === 'yumi' ? 'yumi-backup.json.enc' : 'nomoney-backup.json.enc';
  return {
    reminderDays: settings.reminderDays ?? [30, 14, 7, 3, 1, 0],
    reminderEnabled: settings.reminderEnabled ?? true,
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
    webdavEncryptionKey: settings.webdavEncryptionKey ?? ''
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

function isSensitiveSetting(key: string): key is 'webdavPassword' | 'webdavEncryptionKey' {
  return key === 'webdavPassword' || key === 'webdavEncryptionKey';
}
