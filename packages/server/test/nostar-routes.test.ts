import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { encryptSecret, hashPassword } from '../src/utils/crypto.js';

const sessionSecret = 'nostar-route-test-session-secret';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'Password2026!';

describe('NoStar routes', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;
  const repositoryQueries: Array<Record<string, unknown>> = [];
  const settings = new Map<string, unknown>();

  beforeEach(async () => {
    repositoryQueries.length = 0;
    settings.clear();
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
      noStarRelease: { findMany: async () => [] },
      noStarCategory: { findMany: async () => [] },
      noStarAiProfile: {
        findMany: async ({ where }: any) => where.userId === 1 ? [{
          legacyId: 'ai-1',
          name: 'Primary',
          apiType: 'openai',
          baseUrl: 'https://api.example.com',
          apiKeyEncrypted: encryptSecret('secret-ai-key', encryptionKey),
          model: 'model-1',
          isActive: true,
          customPrompt: null,
          useCustomPrompt: false,
          concurrency: 1,
          reasoningEffort: null,
          mimoPlan: null,
        }] : [],
      },
      noStarWebDavConfig: { findMany: async () => [] },
      noStarAssetFilter: { findMany: async () => [] },
      noStarEmbeddingConfig: { findMany: async () => [] },
      noStarVectorSearchConfig: { findUnique: async () => null },
      noStarAccount: {
        findUnique: async ({ where }: any) => where.userId === 1 ? {
          githubTokenEncrypted: encryptSecret('github-secret-token', encryptionKey),
        } : null,
      },
      noStarSetting: {
        findUnique: async ({ where }: any) => {
          const { userId, key } = where.userId_key;
          return settings.has(`${userId}:${key}`) ? { value: settings.get(`${userId}:${key}`) } : null;
        },
        findMany: async ({ where }: any) => Array.from(settings.entries())
          .filter(([key]) => key.startsWith(`${where.userId}:`))
          .map(([key, value]) => ({ key: key.slice(key.indexOf(':') + 1), value })),
        upsert: async ({ where, update, create }: any) => {
          const { userId, key } = where.userId_key;
          const value = settings.has(`${userId}:${key}`) ? update.value : create.value;
          settings.set(`${userId}:${key}`, value);
          return { userId, key, value };
        },
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

  it('stores network settings separately for each Nono user and masks passwords', async () => {
    const adminCookie = await setupAdmin();
    const readerCookie = await loginSecondUser();

    await app.inject({
      method: 'PUT',
      url: '/api/nostar/settings/proxy',
      headers: { cookie: adminCookie },
      payload: { enabled: true, type: 'http', host: 'proxy.internal', port: 8080, username: 'admin', password: 'admin-secret' },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/nostar/settings/proxy',
      headers: { cookie: readerCookie },
      payload: { enabled: true, type: 'socks5', host: '127.0.0.1', port: 1080, password: 'reader-secret' },
    });

    const adminResponse = await app.inject({ method: 'GET', url: '/api/nostar/settings/proxy', headers: { cookie: adminCookie } });
    const readerResponse = await app.inject({ method: 'GET', url: '/api/nostar/settings/proxy', headers: { cookie: readerCookie } });

    expect(adminResponse.json()).toMatchObject({ type: 'http', host: 'proxy.internal', port: 8080, hasPassword: true });
    expect(readerResponse.json()).toMatchObject({ type: 'socks5', host: '127.0.0.1', port: 1080, hasPassword: true });
    expect(JSON.stringify(adminResponse.json())).not.toContain('admin-secret');
    expect(JSON.stringify(readerResponse.json())).not.toContain('reader-secret');
  });

  it('exports only the authenticated user data with masked secrets', async () => {
    const adminCookie = await setupAdmin();
    const response = await app.inject({ method: 'POST', url: '/api/nostar/sync/export', headers: { cookie: adminCookie } });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.version).toBe(2);
    expect(payload.repositories[0].name).toBe('repo-1');
    expect(payload.ai_configs[0].api_key_masked).toBe('***-key');
    expect(payload.settings.github_token).toBe('***oken');
    expect(JSON.stringify(payload)).not.toContain('secret-ai-key');
    expect(JSON.stringify(payload)).not.toContain('github-secret-token');
  });
});
