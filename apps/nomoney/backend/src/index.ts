import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cron from 'node-cron';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { createSmtpMailer } from './mailer.js';
import { runReminderScan } from './reminders.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.APP_DATA_DIR ?? path.resolve(process.cwd(), 'data');
const jwtSecret = process.env.JWT_SECRET;

if (process.env.NODE_ENV === 'production' && !jwtSecret) {
  throw new Error('JWT_SECRET is required in production');
}

const db = await createDatabase({
  persist: true,
  filePath: path.join(dataDir, 'app.db')
});

const context = {
  db,
  jwtSecret: jwtSecret ?? 'development-only-secret',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookiePath: process.env.COOKIE_PATH ?? '/',
  now: () => new Date(),
  mailer: createSmtpMailer()
};

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
