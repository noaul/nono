import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const cookieName = 'nono_session';

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(key).toString('hex') };
}

export async function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const { hash } = await hashPassword(password, salt);
  const left = Buffer.from(hash, 'hex');
  const right = Buffer.from(expectedHash, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionCookie(user, secret) {
  const payload = Buffer.from(
    JSON.stringify({
      uid: user.id,
      username: user.username,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
    }),
  ).toString('base64url');
  const signature = sign(payload, secret);
  return `${cookieName}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600`;
}

export function clearSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSessionUser(request, state, secret) {
  const token = parseCookies(request.headers.cookie || '')[cookieName];
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload, secret) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.exp < Date.now()) return null;
    return state.users.find((user) => user.id === decoded.uid && user.username === decoded.username) || null;
  } catch {
    return null;
  }
}

export function publicAdminUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    initialized: Boolean(user.passwordHash),
  };
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
