import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cron from 'node-cron';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { createNonoNotifier } from './notifier.js';
import { createNonoSessionVerifier } from './auth.js';
import { runReminderScan } from './reminders.js';
import { getSettings } from './settings.js';
import { assertEncryptionKey, assertRuntimeSecret } from './secret-crypto.js';
import { migrateStoredSecrets } from './secret-migration.js';
import { productAssetTypes, type AppContext } from './types.js';
import { runAutoRenewals } from './renewals.js';
import { runDomainChecks } from './domain-checks.js';
import { mergeYumiDomains } from './yumi-merge.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.APP_DATA_DIR ?? path.resolve(process.cwd(), 'data');
const internalToken = process.env.NOMONEY_INTERNAL_TOKEN;
const nonoInternalUrl = process.env.NONO_INTERNAL_URL || `http://127.0.0.1:${process.env.NONO_INTERNAL_PORT || 3001}`;
const defaultEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const productEncryptionKeyName = 'NOMONEY_ENCRYPTION_KEY';
const encryptionKey = process.env.NOMONEY_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || (
  process.env.NODE_ENV === 'production' ? '' : defaultEncryptionKey
);
const privateOutboundHosts = (process.env.NOMONEY_PRIVATE_OUTBOUND_HOSTS || process.env.PRIVATE_OUTBOUND_HOSTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production') {
  assertRuntimeSecret(internalToken, 'NOMONEY_INTERNAL_TOKEN');
}
if (process.env.NODE_ENV === 'production' && (!encryptionKey || encryptionKey === defaultEncryptionKey)) {
  throw new Error(`${productEncryptionKeyName} or ENCRYPTION_KEY is required in production`);
}
assertEncryptionKey(encryptionKey, productEncryptionKeyName);

const databasePath = path.join(dataDir, 'app.db');
const db = await createDatabase({
  persist: true,
  filePath: databasePath
});

// One-time: take domains back from the retired Yumi database (left in place as an archive).
const legacyYumiDataDir = process.env.LEGACY_YUMI_DATA_DIR ?? path.resolve(dataDir, '../yumi-data');
const yumiMerge = await mergeYumiDomains(db, path.join(legacyYumiDataDir, 'app.db'));
if (yumiMerge.merged) console.log(`Merged domains from Yumi: ${JSON.stringify(yumiMerge.counts)}`);

const context: AppContext = {
  db,
  verifySession: createNonoSessionVerifier({ baseUrl: nonoInternalUrl, internalToken: internalToken ?? '' }),
  internalToken,
  publicOrigin: resolvePublicOrigin(process.env.NONO_PUBLIC_URL),
  encryptionKey,
  privateOutboundHosts,
  now: () => new Date(),
  notifier: createNonoNotifier({ baseUrl: nonoInternalUrl, internalToken: internalToken ?? '' })
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
const publicDir = path.resolve(dirname, '../public');
app.use(express.static(publicDir));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Hourly, gated on the configured time zone: settings can change the zone at
// runtime, and a run missed while the service was down is picked up later the
// same day. Already-sent reminders are deduplicated by reminder_logs.
cron.schedule('7 * * * *', () => {
  const settings = getSettings(context);
  if (localHour(context.now(), settings.timezone) < 9) return;
  try {
    runAutoRenewals(context, [...productAssetTypes]);
  } catch (error) {
    console.error('Auto-renewal run failed', error);
  }
  // Domain checks only touch entries not refreshed recently, so hourly runs are cheap.
  runDomainChecks(context).catch((error) => console.error('Domain checks failed', error))
    .then(() => runReminderScan(context, [...productAssetTypes])).catch((error) => {
    console.error('Reminder scan failed', error);
  });
}, { timezone: 'UTC' });

function localHour(date: Date, timeZone: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(date));
  } catch {
    return date.getUTCHours();
  }
}

app.listen(port, () => {
  console.log(`NoMoney listening on port ${port}`);
});
