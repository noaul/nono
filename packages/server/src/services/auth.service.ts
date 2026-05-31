import type { Repository, UserRecord } from './repository.js';
import type { Role } from '../types.js';
import { createSessionToken, hashPassword, verifyPassword } from '../utils/crypto.js';

export async function setupAdmin(repo: Repository, input: { username: string; email?: string; displayName?: string; password: string }) {
  const users = await repo.listUsers();
  const existingAdmin = users.find((user) => user.role === 'admin' && user.passwordHash);
  if (existingAdmin) throw Object.assign(new Error('Admin is already initialized'), { statusCode: 409 });
  const existing = users.find((user) => user.username === input.username) || users[0];
  if (existing) {
    return repo.updateUser(existing.id, {
      username: input.username,
      email: input.email || existing.email || `${input.username}@nono.local`,
      displayName: input.displayName || input.username,
      passwordHash: await hashPassword(input.password),
      role: 'admin',
    });
  }
  return repo.createUser({
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

export async function loginUser(repo: Repository, input: { username: string; password: string }, sessionSecret: string) {
  const user = await repo.findUserByUsername(input.username);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw Object.assign(new Error('Invalid username or password'), { statusCode: 401 });
  return { user, token: createSessionToken(user, sessionSecret) };
}

export function assertStrongPassword(password: string) {
  if (!password || password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw Object.assign(new Error('Password must be at least 10 characters and include letters and numbers'), { statusCode: 400 });
  }
}
