import type { Repository, UserRecord } from './repository.js';
import type { Role } from '../types.js';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../utils/crypto.js';

export async function setupAdmin(repo: Repository, input: { username: string; email?: string; displayName?: string; password: string }) {
  return repo.initializeAdmin({
    username: input.username,
    email: input.email || `${input.username}@nono.local`,
    displayName: input.displayName || input.username,
    passwordHash: await hashPassword(input.password),
    role: 'admin',
  } as Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>);
}

export async function registerUser(repo: Repository, input: { username: string; email: string; displayName?: string; password: string }, role: Role) {
  if (await repo.findUserByUsername(input.username)) throw Object.assign(new Error('Username already exists'), { statusCode: 409 });
  if (await repo.findUserByEmail(input.email)) throw Object.assign(new Error('Email already exists'), { statusCode: 409 });
  return repo.createUser({
    username: input.username,
    email: input.email,
    displayName: input.displayName || input.username,
    passwordHash: await hashPassword(input.password),
    role,
  } as Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>);
}

/**
 * The hash of a password nobody holds, derived once on first use.
 *
 * An unknown username is verified against this instead of returning early, so a failed login costs
 * the same scrypt work either way. Skipping the comparison would answer in microseconds where a
 * real account takes ~100ms, which is a single-request oracle for whether an account exists.
 */
let absentUserPasswordHash: Promise<string> | null = null;

function absentUserHash() {
  absentUserPasswordHash ??= hashPassword(randomBytes(32).toString('hex'));
  return absentUserPasswordHash;
}

export async function loginUser(repo: Repository, input: { username: string; password: string }) {
  const user = await repo.findUserByUsername(input.username);
  const passwordMatches = await verifyPassword(input.password, user?.passwordHash || await absentUserHash());
  if (!user || !passwordMatches) throw Object.assign(new Error('Invalid username or password'), { statusCode: 401 });
  return { user };
}

export function assertStrongPassword(password: string) {
  if (!password || password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw Object.assign(new Error('Password must be at least 10 characters and include letters and numbers'), { statusCode: 400 });
  }
}
