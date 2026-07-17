import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { hashPassword } from '../src/utils/crypto.js';

const sessionSecret = 'nostar-route-test-session-secret';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'Password2026!';

describe('NoStar routes', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;
  const repositoryQueries: Array<Record<string, unknown>> = [];

  beforeEach(async () => {
    repositoryQueries.length = 0;
    repo = new MemoryRepository(false);
    const prisma = {
      noStarRepository: {
        findMany: async ({ where }: any) => {
          repositoryQueries.push(where);
          return [{
            githubId: BigInt(where.userId * 100),
            name: `repo-${where.userId}`,
            fullName: `owner/repo-${where.userId}`,
            htmlUrl: `https://github.com/owner/repo-${where.userId}`,
            stargazersCount: 1,
            ownerLogin: 'owner',
            topics: [],
            aiTags: [],
            aiPlatforms: [],
            customTags: [],
          }];
        },
        count: async () => 1,
      },
    };
    app = await buildApp({ repo, prisma: prisma as any, sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
  });

  async function setupAdmin() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@nostar.test', displayName: 'Admin', password },
    });
    return String(response.headers['set-cookie']);
  }

  async function loginSecondUser() {
    await repo.createUser({
      username: 'reader',
      email: 'reader@nostar.test',
      displayName: 'Reader',
      passwordHash: await hashPassword(password),
      role: 'user',
    });
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'reader', password } });
    return String(response.headers['set-cookie']);
  }

  it('requires a Nono session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nostar/repositories' });
    expect(response.statusCode).toBe(401);
    expect(repositoryQueries).toHaveLength(0);
  });

  it('always scopes repository queries to the authenticated user', async () => {
    const adminCookie = await setupAdmin();
    const readerCookie = await loginSecondUser();

    const adminResponse = await app.inject({ method: 'GET', url: '/api/nostar/repositories', headers: { cookie: adminCookie } });
    const readerResponse = await app.inject({ method: 'GET', url: '/api/nostar/repositories', headers: { cookie: readerCookie } });

    expect(adminResponse.json().repositories[0].name).toBe('repo-1');
    expect(readerResponse.json().repositories[0].name).toBe('repo-2');
    expect(repositoryQueries).toEqual([{ userId: 1 }, { userId: 2 }]);
  });
});
