import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptLegacySecret, parseMigrationArgs } from '../src/scripts/migrate-nostar-sqlite.js';

function legacyEncrypt(value: string, keyHex: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${cipher.getAuthTag().toString('base64')}`;
}

describe('NoStar SQLite migration', () => {
  it('parses dry-run migration arguments', () => {
    const args = parseMigrationArgs(['--sqlite', './data.db', '--username', 'admin', '--dry-run']);
    expect(args.username).toBe('admin');
    expect(args.sqlitePath).toMatch(/data\.db$/);
    expect(args.dryRun).toBe(true);
  });

  it('decrypts the legacy AES-GCM format before re-encryption', () => {
    const key = 'ab'.repeat(32);
    expect(decryptLegacySecret(legacyEncrypt('ghp_secret', key), key)).toBe('ghp_secret');
  });
});
