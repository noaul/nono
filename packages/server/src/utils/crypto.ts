import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = await hashPassword(password, salt);
  const left = Buffer.from(actual.split(':')[1], 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionToken(user: { id: number; username: string }, secret: string) {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, username: user.username, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const actual = Buffer.from(sign(payload, secret), 'base64url');
  const expected = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.exp >= Date.now() ? decoded : null;
  } catch {
    return null;
  }
}

export function generateApiToken() {
  return `nono_${randomBytes(24).toString('base64url')}`;
}

export function hashApiToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function encryptSecret(value: string, keyHex: string) {
  const key = normalizeKey(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string | null | undefined, keyHex: string) {
  if (!value) return '';
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', normalizeKey(keyHex), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
}

function normalizeKey(keyHex: string) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('Encryption key must be 64 hexadecimal characters');
  }
  return Buffer.from(keyHex, 'hex');
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
