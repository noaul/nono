import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cron from 'node-cron';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { createSmtpMailer } from './mailer.js';
import { runReminderScan } from './reminders.js';
import { assertEncryptionKey } from './secret-crypto.js';
import { migrateStoredSecrets } from './secret-migration.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.APP_DATA_DIR ?? path.resolve(process.cwd(), 'data');
const jwtSecret = process.env.JWT_SECRET;
const defaultEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const encryptionKey = process.env.NOMONEY_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || (
  process.env.NODE_ENV === 'production' ? '' : defaultEncryptionKey
);
const privateOutboundHosts = (process.env.NOMONEY_PRIVATE_OUTBOUND_HOSTS || process.env.PRIVATE_OUTBOUND_HOSTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && !jwtSecret) {
  throw new Error('JWT_SECRET is required in production');
}
if (process.env.NODE_ENV === 'production' && (!encryptionKey || encryptionKey === defaultEncryptionKey)) {
  throw new Error('NOMONEY_ENCRYPTION_KEY or ENCRYPTION_KEY is required in production');
}
assertEncryptionKey(encryptionKey, 'NOMONEY_ENCRYPTION_KEY');

const db = await createDatabase({
  persist: true,
  filePath: path.join(dataDir, 'app.db')
});

const context = {
  db,
  jwtSecret: jwtSecret ?? 'development-only-secret',
  internalToken: process.env.NOMONEY_INTERNAL_TOKEN,
  encryptionKey,
  privateOutboundHosts,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookiePath: process.env.COOKIE_PATH ?? '/',
  now: () => new Date(),
  mailer: createSmtpMailer()
};

migrateStoredSecrets(context);

const app = createApp(context);
const publicDir = path.resolve(dirname, '../public');
app.use(express.static(publicDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

cron.schedule(
  '0 9 * * *',
  () => {
    runReminderScan(context).catch((error) => {
      console.error('Reminder scan failed', error);
    });
  },
  { timezone: process.env.TZ ?? 'Asia/Shanghai' }
);

app.listen(port, () => {
  console.log(`NoMoney listening on port ${port}`);
});
