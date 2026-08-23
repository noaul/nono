import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cron from 'node-cron';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { createSmtpMailer } from './mailer.js';
import { runReminderScan } from './reminders.js';
import { assertEncryptionKey, assertRuntimeSecret } from './secret-crypto.js';
import { migrateStoredSecrets } from './secret-migration.js';
import type { ProductMode } from './types.js';
import { migrateYumiData, waitForDatabaseFile } from './yumi-migration.js';
import { runStatusSweep } from './status.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const product = (process.env.PRODUCT_MODE === 'yumi' ? 'yumi' : 'nomoney') as ProductMode;
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.APP_DATA_DIR ?? path.resolve(process.cwd(), 'data');
const jwtSecret = process.env.JWT_SECRET;
const internalToken = process.env.NOMONEY_INTERNAL_TOKEN;
const bootstrapToken = process.env.BOOTSTRAP_TOKEN;
const defaultEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const productEncryptionKeyName = product === 'yumi' ? 'YUMI_ENCRYPTION_KEY' : 'NOMONEY_ENCRYPTION_KEY';
const encryptionKey = (product === 'yumi' ? process.env.YUMI_ENCRYPTION_KEY : process.env.NOMONEY_ENCRYPTION_KEY) || process.env.ENCRYPTION_KEY || (
  process.env.NODE_ENV === 'production' ? '' : defaultEncryptionKey
);
const privateOutboundHosts = (process.env.NOMONEY_PRIVATE_OUTBOUND_HOSTS || process.env.PRIVATE_OUTBOUND_HOSTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production') {
  assertRuntimeSecret(jwtSecret, 'JWT_SECRET');
  assertRuntimeSecret(internalToken, 'NOMONEY_INTERNAL_TOKEN');
  assertRuntimeSecret(bootstrapToken, 'BOOTSTRAP_TOKEN');
}
if (process.env.NODE_ENV === 'production' && (!encryptionKey || encryptionKey === defaultEncryptionKey)) {
  throw new Error(`${productEncryptionKeyName} or ENCRYPTION_KEY is required in production`);
}
assertEncryptionKey(encryptionKey, productEncryptionKeyName);

const databasePath = path.join(dataDir, 'app.db');
if (product === 'yumi' && !fs.existsSync(databasePath)) {
  const sourcePath = path.join(process.env.NOMONEY_DATA_DIR || path.resolve(process.cwd(), '../nomoney-data'), 'app.db');
  await waitForDatabaseFile(sourcePath);
  await migrateYumiData({
    sourcePath,
    targetPath: databasePath,
    sourceEncryptionKey: process.env.NOMONEY_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '',
    targetEncryptionKey: encryptionKey
  });
}

const db = await createDatabase({
  persist: true,
  filePath: databasePath,
  product
});

const context = {
  db,
  product,
  jwtSecret: jwtSecret ?? 'development-only-secret',
  internalToken,
  bootstrapToken,
  publicOrigin: resolvePublicOrigin(process.env.NONO_PUBLIC_URL),
  encryptionKey,
  privateOutboundHosts,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookiePath: process.env.COOKIE_PATH ?? '/',
  now: () => new Date(),
  mailer: createSmtpMailer()
};

function resolvePublicOrigin(value: string | undefined): string | undefined {
  if (!value) {
    if (process.env.NODE_ENV === 'production') throw new Error('NONO_PUBLIC_URL is required in production');
    return undefined;
  }
  try {
    return new URL(value).origin;
  } catch {
    throw new Error('NONO_PUBLIC_URL must be a valid URL');
  }
}

migrateStoredSecrets(context);

const app = createApp(context);
const publicDir = path.resolve(dirname, product === 'yumi' ? '../public-yumi' : '../public');
app.use(express.static(publicDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

cron.schedule(
  '0 9 * * *',
  () => {
    runReminderScan(context, product === 'yumi' ? ['vps', 'domain'] : ['phone', 'subscription']).catch((error) => {
      console.error('Reminder scan failed', error);
    });
  },
  { timezone: process.env.TZ ?? 'Asia/Shanghai' }
);

if (product === 'yumi') {
  cron.schedule('*/5 * * * *', () => {
    runStatusSweep(context).catch((error) => console.error('Yumi status sweep failed', error));
  }, { timezone: 'UTC' });
  setTimeout(() => runStatusSweep(context).catch((error) => console.error('Initial Yumi status sweep failed', error)), 10_000).unref();
}

app.listen(port, () => {
  console.log(`${product === 'yumi' ? 'Yumi' : 'NoMoney'} listening on port ${port}`);
});
