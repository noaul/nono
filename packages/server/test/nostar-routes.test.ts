import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let safeRequester: ReturnType<typeof vi.fn>;
  let releaseDeleteMany: ReturnType<typeof vi.fn>;
  let prisma: any;

  beforeEach(async () => {
    repositoryQueries.length = 0;
    settings.clear();
    releaseDeleteMany = vi.fn(async () => ({ count: 1 }));
    safeRequester = vi.fn(async () => ({ statusCode: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"ok":true}') }));
    repo = new MemoryRepository(false);
    prisma = {
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
      noStarRelease: {
        findMany: async () => [],
        count: async () => 0,
        upsert: async () => ({}),
        deleteMany: releaseDeleteMany,
      },
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
        findUnique: async ({ where }: any) => where.userId_legacyId.userId === 1 && where.userId_legacyId.legacyId === 'ai-1'
          ? {
              legacyId: 'ai-1',
              name: 'Primary',
              apiType: 'openai',
              baseUrl: 'https://api.example.com',
              apiKeyEncrypted: encryptSecret('secret-ai-key', encryptionKey),
              model: 'model-1',
              reasoningEffort: null,
            }
          : null,
      },
      noStarWebDavConfig: {
        findMany: async () => [],
        findUnique: async ({ where }: any) => where.userId_legacyId.userId === 2 && where.userId_legacyId.legacyId === 'webdav-1'
          ? {
              legacyId: 'webdav-1',
              url: 'https://dav.example/root/',
              username: 'reader',
              passwordEncrypted: encryptSecret('dav-secret', encryptionKey),
            }
          : null,
      },
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
    prisma.$transaction = async (operation: (tx: any) => unknown) => operation(prisma);
    app = await buildApp({ repo, prisma: prisma as any, sessionSecret, encryptionKey, safeRequester: safeRequester as any });
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

  it('requires a NoNo session', async () => {
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

  it('deletes releases missing from an authenticated full snapshot', async () => {
    const adminCookie = await setupAdmin();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/nostar/releases',
      headers: { cookie: adminCookie },
      payload: { releases: [], isFullSync: true },
    });

    expect(response.statusCode).toBe(200);
    expect(releaseDeleteMany).toHaveBeenCalledWith({
      where: { userId: 1, githubId: { notIn: [] } },
    });
  });

  it('links releases pushed in the web app shape and returns their repository', async () => {
    const adminCookie = await setupAdmin();
    prisma.noStarRepository.findMany = async () => [{ id: 7, githubId: BigInt(555), fullName: 'owner/app' }];
    const releaseUpsert = vi.fn(async () => ({}));
    prisma.noStarRelease.upsert = releaseUpsert;

    const pushed = await app.inject({
      method: 'PUT',
      url: '/api/nostar/releases',
      headers: { cookie: adminCookie },
      payload: {
        isFullSync: true,
        releases: [{ id: 900, tag_name: 'v1', name: null, body: null, published_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/owner/app/releases/v1', assets: [], repository: { id: 555, full_name: 'owner/app', name: 'app' } }],
      },
    });

    expect(pushed.statusCode).toBe(200);
    expect(releaseUpsert).toHaveBeenCalledTimes(1);
    expect(releaseUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ githubId: BigInt(900), repositoryId: 7, repoFullName: 'owner/app', repoName: 'app' }),
    }));

    const findMany = vi.fn(async () => [{
      githubId: BigInt(900), tagName: 'v1', name: null, body: null, publishedAt: new Date('2026-01-01T00:00:00Z'), htmlUrl: null,
      assets: [], zipballUrl: null, tarballUrl: null, repoFullName: 'owner/app', repoName: 'app', prerelease: false, draft: false, isRead: true,
      repository: { githubId: BigInt(555), fullName: 'owner/app', name: 'app' },
    }]);
    prisma.noStarRelease.findMany = findMany;
    const fetched = await app.inject({ method: 'GET', url: '/api/nostar/releases', headers: { cookie: adminCookie } });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ include: { repository: { select: { githubId: true, fullName: true, name: true } } } }));
    expect(fetched.json().releases[0]).toMatchObject({ id: 900, is_read: true, repository: { id: 555, full_name: 'owner/app', name: 'app' } });
  });

  it('merges edits from a stale device without replacing other fields or deleting new repositories', async () => {
    const cookie = await setupAdmin();
    const first = await app.inject({ method: 'GET', url: '/api/nostar/repositories', headers: { cookie } });
    const base = first.json().repositories;
    const originalFind = prisma.noStarRepository.findMany;
    prisma.noStarRepository.findMany = async (args: any) => (await originalFind(args)).map((row: any) => ({ ...row, customDescription: 'New device description', customTags: ['new-device'] }));
    const upsert = vi.fn(async () => ({}));
    const remove = vi.fn(async () => ({ count: 0 }));
    prisma.noStarRepository.upsert = upsert;
    prisma.noStarRepository.deleteMany = remove;
    const edited = [{ ...base[0], custom_category: 'tools' }];
    const saved = await app.inject({ method: 'PUT', url: '/api/nostar/repositories', headers: { cookie }, payload: { repositories: edited, baseRepositories: base, isFullSync: true } });
    expect(saved.statusCode).toBe(200);
    expect(upsert.mock.calls[0]).toEqual([expect.objectContaining({ update: expect.objectContaining({ customDescription: 'New device description', customTags: ['new-device'], customCategory: 'tools' }) })]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rekeys legacy repository rows in place and merges concurrent edits against the old baseline', async () => {
    const cookie = await setupAdmin();
    const legacy = 1_800_000_000_000;
    const row: any = { id: 7, userId: 1, githubId: BigInt(legacy), name: 'tool', fullName: 'owner/tool', customDescription: 'base', customTags: [], topics: [] };
    const rows = [row];
    prisma.noStarRepository.findMany = async () => rows;
    prisma.noStarRepository.update = async ({ where, data }: any) => Object.assign(rows.find(r => r.id === where.id), data);
    prisma.noStarRepository.deleteMany = async ({ where }: any) => {
      for (let index = rows.length - 1; index >= 0; index--) {
        if (where.githubId?.in?.includes(rows[index].githubId)) rows.splice(index, 1);
      }
      return { count: 0 };
    };
    prisma.noStarRepository.upsert = async ({ where, update, create }: any) => {
      const current = rows.find(r => r.githubId === where.userId_githubId.githubId);
      if (current) return Object.assign(current, update);
      rows.push({ id: 8, ...create });
      return rows.at(-1);
    };
    const base = (await app.inject({ method: 'GET', url: '/api/nostar/repositories', headers: { cookie } })).json().repositories;
    row.customDescription = 'remote edit';
    const saved = await app.inject({ method: 'PUT', url: '/api/nostar/repositories', headers: { cookie }, payload: {
      repositories: [{ ...base[0], id: 42, custom_category: 'local category' }], baseRepositories: base, isFullSync: true,
    } });
    expect(saved.statusCode).toBe(200);
    expect(rows).toEqual([expect.objectContaining({ id: 7, githubId: 42n, customDescription: 'remote edit', customCategory: 'local category' })]);
  });

  it('keeps distinct real GitHub identities when one reuses the cached name of another', async () => {
    const cookie = await setupAdmin();
    const rows: any[] = [];
    prisma.noStarRepository.findMany = async () => rows;
    prisma.noStarRepository.upsert = async ({ where, update, create }: any) => {
      const current = rows.find(r => r.githubId === where.userId_githubId.githubId);
      if (current) return Object.assign(current, update);
      rows.push({ id: rows.length + 1, ...create });
      return rows.at(-1);
    };
    const saved = await app.inject({ method: 'PUT', url: '/api/nostar/repositories', headers: { cookie }, payload: {
      repositories: [{ id: 41, full_name: 'owner/tool', ai_summary: 'old' }, { id: 42, full_name: 'owner/tool' }],
    } });
    expect(saved.statusCode).toBe(200);
    expect(rows.map(r => [r.githubId, r.aiSummary])).toEqual([[41n, 'old'], [42n, null]]);
  });

  it('keeps remote deletions while saving unrelated edits from a stale device', async () => {
    const cookie = await setupAdmin();
    const [original] = await prisma.noStarRepository.findMany({ where: { userId: 1 } });
    const rows = new Map<bigint, any>([
      [100n, original],
      [200n, { ...original, githubId: 200n, name: 'other', fullName: 'owner/other' }],
    ]);
    prisma.noStarRepository.findMany = async () => Array.from(rows.values());
    prisma.noStarRepository.count = async () => rows.size;
    prisma.noStarRepository.upsert = async ({ where, update, create }: any) => {
      const id = where.userId_githubId.githubId;
      rows.set(id, rows.has(id) ? { ...rows.get(id), ...update } : create);
      return rows.get(id);
    };
    const initial = await app.inject({ method: 'GET', url: '/api/nostar/repositories', headers: { cookie } });
    const base = initial.json().repositories;
    rows.delete(100n); // Another device removes the first repository before this device saves.

    const saved = await app.inject({
      method: 'PUT', url: '/api/nostar/repositories', headers: { cookie },
      payload: {
        baseRepositories: base, isFullSync: true,
        repositories: base.map((repository: any) => ({ ...repository, custom_description: 'Local edit' })),
      },
    });

    expect(saved.statusCode).toBe(200);
    const current = await app.inject({ method: 'GET', url: '/api/nostar/repositories', headers: { cookie } });
    expect(current.json().repositories).toEqual([
      expect.objectContaining({ id: 200, custom_description: 'Local edit' }),
    ]);
  });

  it('proxies translation and trending only to allowed endpoints and requires a session', async () => {
    const cookie = await setupAdmin();
    const url = 'https://edge.microsoft.com/translate/translatetext?to=zh-Hans';
    const body = JSON.stringify([{ Text: 'hello' }]);
    const translated = await app.inject({ method: 'POST', url: '/api/nostar/proxy/public', headers: { cookie }, payload: { url, method: 'POST', body, headers: { 'Content-Type': 'application/json', authorization: 'should-not-forward' } } });
    expect(translated.statusCode).toBe(200);
    expect(safeRequester).toHaveBeenCalledWith(url, expect.objectContaining({ body, headers: { 'content-type': 'application/json' } }));
    const rejected = await app.inject({ method: 'POST', url: '/api/nostar/proxy/public', headers: { cookie }, payload: { url: 'https://edge.microsoft.com/arbitrary', method: 'GET' } });
    expect(rejected.statusCode).toBe(400);
    const token = (await repo.createToken(1, 'token', null, ['*'])).token;
    const denied = await app.inject({ method: 'POST', url: '/api/nostar/proxy/public', headers: { authorization: `Bearer ${token}` }, payload: { url } });
    expect(denied.statusCode).toBe(403);
    const trending = await app.inject({ method: 'POST', url: '/api/nostar/proxy/public', headers: { cookie }, payload: { url: 'https://mshibanami.github.io/GitHubTrendingRSS/weekly/all.xml' } });
    expect(trending.statusCode).toBe(200);
  });

  it('uses stored embedding and vector secrets without sending them to a changed origin', async () => {
    const cookie = await setupAdmin();
    prisma.noStarEmbeddingConfig.findUnique = async () => ({ legacyId: 'embedding', apiType: 'openai', baseUrl: 'https://embedding.example', model: 'embed', apiKeyEncrypted: encryptSecret('embedding-secret', encryptionKey) });
    prisma.noStarVectorSearchConfig.findUnique = async () => ({ workerUrl: 'https://vectors.example', authTokenEncrypted: encryptSecret('vector-secret', encryptionKey) });
    const embedded = await app.inject({ method: 'POST', url: '/api/nostar/proxy/embedding', headers: { cookie }, payload: { config: { id: 'embedding', apiKey: '***' }, body: { model: 'embed', input: ['hello'] } } });
    expect(embedded.statusCode).toBe(200);
    expect(safeRequester).toHaveBeenCalledWith('https://embedding.example/v1/embeddings', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer embedding-secret' }) }));
    const vector = await app.inject({ method: 'POST', url: '/api/nostar/proxy/vector', headers: { cookie }, payload: { config: { authToken: '***' }, path: '/status' } });
    expect(vector.statusCode).toBe(200);
    expect(safeRequester).toHaveBeenCalledWith('https://vectors.example/status', expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ authorization: 'Bearer vector-secret' }) }));
    const denied = await app.inject({ method: 'POST', url: '/api/nostar/proxy/vector', headers: { cookie }, payload: { config: { workerUrl: 'https://elsewhere.example', authToken: '***' }, path: '/status' } });
    expect(denied.statusCode).toBe(400);
  });

  it('verifies the GitHub token the user typed instead of the stored one', async () => {
    await setupAdmin();
    const readerCookie = await loginSecondUser();
    safeRequester.mockResolvedValueOnce({ statusCode: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"login":"reader","id":2}') });

    const response = await app.inject({
      method: 'POST',
      url: '/api/nostar/settings/github-token/verify',
      headers: { cookie: readerCookie },
      payload: { token: 'typed-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ login: 'reader' });
    expect(safeRequester).toHaveBeenCalledWith('https://api.github.com/user', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ authorization: 'Bearer typed-token' }),
    }));
  });

  it('passes through GitHub rejecting a typed token even when a good one is stored', async () => {
    const adminCookie = await setupAdmin();
    safeRequester.mockResolvedValueOnce({ statusCode: 401, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"message":"Bad credentials"}') });

    const response = await app.inject({
      method: 'POST',
      url: '/api/nostar/settings/github-token/verify',
      headers: { cookie: adminCookie },
      payload: { token: 'expired-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(safeRequester.mock.calls[0][1].headers.authorization).toBe('Bearer expired-token');
  });

  it('applies the administrator check to network settings in imports', async () => {
    await setupAdmin();
    const readerCookie = await loginSecondUser();

    const response = await app.inject({
      method: 'POST',
      url: '/api/nostar/sync/import',
      headers: { cookie: readerCookie },
      payload: { settings: { proxy_config: { enabled: true, type: 'socks5', host: '127.0.0.1', port: 1080 } } },
    });

    expect(response.statusCode).toBe(403);
    expect(settings.has('2:proxy_config')).toBe(false);
  });

  it('drops a stored AI key when a masked key is saved for a different origin', async () => {
    const adminCookie = await setupAdmin();
    const created: any[] = [];
    prisma.noStarAiProfile.deleteMany = async () => ({ count: 1 });
    prisma.noStarAiProfile.create = async ({ data }: any) => { created.push(data); return data; };
    const profile = { id: 'ai-1', name: 'Primary', apiType: 'openai', apiKey: '***-key', model: 'model-1', isActive: true };

    await app.inject({ method: 'PUT', url: '/api/nostar/configs/ai/bulk', headers: { cookie: adminCookie }, payload: { configs: [{ ...profile, baseUrl: 'https://api.example.com/v2' }] } });
    await app.inject({ method: 'PUT', url: '/api/nostar/configs/ai/bulk', headers: { cookie: adminCookie }, payload: { configs: [{ ...profile, baseUrl: 'https://attacker.example' }] } });

    expect(created[0].apiKeyEncrypted).toEqual(expect.any(String));
    expect(created[1].apiKeyEncrypted).toBeNull();
  });

  it('does not test a masked stored AI key against a new origin', async () => {
    const adminCookie = await setupAdmin();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/nostar/ai/test',
      headers: { cookie: adminCookie },
      payload: { id: 'ai-1', apiType: 'openai', baseUrl: 'https://attacker.example', apiKey: '***-key', model: 'model-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(safeRequester).not.toHaveBeenCalled();
  });

  it('drops a stored WebDAV password when only the URL host changes', async () => {
    await setupAdmin();
    const readerCookie = await loginSecondUser();
    const created: any[] = [];
    prisma.noStarWebDavConfig.findMany = async () => [{ legacyId: 'webdav-1', url: 'https://dav.example/root/', passwordEncrypted: encryptSecret('dav-secret', encryptionKey) }];
    prisma.noStarWebDavConfig.deleteMany = async () => ({ count: 1 });
    prisma.noStarWebDavConfig.create = async ({ data }: any) => { created.push(data); return data; };
    const config = { id: 'webdav-1', name: 'DAV', username: 'reader', password: '***cret', path: '/', isActive: true };

    await app.inject({ method: 'PUT', url: '/api/nostar/configs/webdav/bulk', headers: { cookie: readerCookie }, payload: { configs: [{ ...config, url: 'https://dav.example/other/' }] } });
    await app.inject({ method: 'PUT', url: '/api/nostar/configs/webdav/bulk', headers: { cookie: readerCookie }, payload: { configs: [{ ...config, url: 'https://evil.example/root/' }] } });

    expect(created[0].passwordEncrypted).toEqual(expect.any(String));
    expect(created[1].passwordEncrypted).toBeNull();
  });

  it('restricts server network proxy settings to administrators', async () => {
    const adminCookie = await setupAdmin();
    const readerCookie = await loginSecondUser();

    await app.inject({
      method: 'PUT',
      url: '/api/nostar/settings/proxy',
      headers: { cookie: adminCookie },
      payload: { enabled: true, type: 'http', host: 'proxy.internal', port: 8080, username: 'admin', password: 'admin-secret' },
    });
    const readerUpdate = await app.inject({
      method: 'PUT',
      url: '/api/nostar/settings/proxy',
      headers: { cookie: readerCookie },
      payload: { enabled: true, type: 'socks5', host: '127.0.0.1', port: 1080, password: 'reader-secret' },
    });

    const adminResponse = await app.inject({ method: 'GET', url: '/api/nostar/settings/proxy', headers: { cookie: adminCookie } });
    const readerResponse = await app.inject({ method: 'GET', url: '/api/nostar/settings/proxy', headers: { cookie: readerCookie } });
    const readerRpcResponse = await app.inject({ method: 'GET', url: '/api/nostar/settings/rpc-download', headers: { cookie: readerCookie } });

    expect(adminResponse.json()).toMatchObject({ type: 'http', host: 'proxy.internal', port: 8080, hasPassword: true });
    expect(readerUpdate.statusCode).toBe(403);
    expect(readerResponse.statusCode).toBe(403);
    expect(readerRpcResponse.statusCode).toBe(403);
    expect(JSON.stringify(adminResponse.json())).not.toContain('admin-secret');
  });

  it('uses the safe requester for ordinary-user AI calls', async () => {
    await setupAdmin();
    const readerCookie = await loginSecondUser();
    safeRequester.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"choices":[{"message":{"content":"ok"}}]}'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/nostar/proxy/ai',
      headers: { cookie: readerCookie },
      payload: {
        config: { apiType: 'openai', baseUrl: 'https://ai.example', apiKey: 'key', model: 'model' },
        body: { model: 'model', messages: [] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(safeRequester).toHaveBeenCalledWith(
      'https://ai.example/v1/chat/completions',
      expect.objectContaining({ method: 'POST', allowPrivateHosts: [] }),
    );
  });

  it('does not grant a bearer AI proxy the administrator private-host allowlist', async () => {
    await app.close();
    app = await buildApp({
      repo,
      prisma,
      sessionSecret,
      encryptionKey,
      safeRequester: safeRequester as any,
      privateOutboundHosts: ['ai.lan'],
    });
    await setupAdmin();
    const token = (await repo.createToken(1, 'automation', null, ['*'])).token;
    safeRequester.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"choices":[{"message":{"content":"ok"}}]}'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/nostar/proxy/ai',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config: { apiType: 'openai', baseUrl: 'http://ai.lan', apiKey: 'inline-key', model: 'model' },
        body: { model: 'model', messages: [] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(safeRequester).toHaveBeenCalledWith(
      'http://ai.lan/v1/chat/completions',
      expect.objectContaining({ allowPrivateHosts: [] }),
    );
  });

  it('uses the safe requester for WebDAV and does not expose private hosts to ordinary users', async () => {
    await setupAdmin();
    const readerCookie = await loginSecondUser();
    safeRequester.mockResolvedValueOnce({
      statusCode: 207,
      headers: { 'content-type': 'application/xml' },
      body: Buffer.from('<multistatus/>'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/nostar/proxy/webdav',
      headers: { cookie: readerCookie },
      payload: { configId: 'webdav-1', method: 'PROPFIND', path: '/backup/' },
    });

    expect(response.statusCode).toBe(207);
    expect(safeRequester).toHaveBeenCalledWith(
      'https://dav.example/root/backup/',
      expect.objectContaining({ method: 'PROPFIND', allowPrivateHosts: [] }),
    );
  });

  it('honors bounded WebDAV operation timeouts and preserves raw XML', async () => {
    await setupAdmin();
    const cookie = await loginSecondUser();
    for (const [requested, expected] of [[15000, 15000], [900000, 300000], [-1, 1000]]) {
      safeRequester.mockResolvedValueOnce({statusCode: 207, headers: {'content-type': 'application/xml'}, body: Buffer.from('<multistatus/>')});
      const response = await app.inject({method: 'POST', url: '/api/nostar/proxy/webdav', headers: {cookie}, payload: {configId: 'webdav-1', method: 'PROPFIND', path: '/backup/', timeoutMs: requested}});
      expect(response.statusCode).toBe(207);
      expect(response.body).toBe('<multistatus/>');
      expect(safeRequester).toHaveBeenLastCalledWith('https://dav.example/root/backup/', expect.objectContaining({timeoutMs: expected}));
    }
  });

  it('keeps WebDAV requests on the configured origin', async () => {
    await setupAdmin();
    const readerCookie = await loginSecondUser();

    const response = await app.inject({
      method: 'POST',
      url: '/api/nostar/proxy/webdav',
      headers: { cookie: readerCookie },
      payload: { configId: 'webdav-1', method: 'GET', path: 'https://attacker.example/collect' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_WEBDAV_PATH');
    expect(safeRequester).not.toHaveBeenCalled();
  });

  it('accepts encoded collection names when reading DAV capabilities', async () => {
    await setupAdmin();
    const cookie = await loginSecondUser();
    prisma.noStarWebDavConfig.findUnique = async () => ({url: 'https://dav.example/My%20Files/%E5%A4%87%E4%BB%BD/', username: 'reader', passwordEncrypted: encryptSecret('dav-password', encryptionKey)});
    safeRequester.mockResolvedValueOnce({statusCode: 200, headers: {'content-type': 'text/plain', server: 'TestDAV', dav: '1, 2'}, body: Buffer.from('')});
    const response = await app.inject({method: 'POST', url: '/api/nostar/proxy/webdav', headers: {cookie}, payload: {configId: 'webdav-1', method: 'OPTIONS', path: './'}});
    expect(response.statusCode).toBe(200);
    expect(response.headers.server).toBe('TestDAV');
    expect(response.headers.dav).toBe('1, 2');
  });

  it('does not interpret escaped question marks or fragments as URL structure', async () => {
    await setupAdmin();
    const cookie = await loginSecondUser();
    for (const base of ['https://dav.example/My%3FFiles/', 'https://dav.example/My%23Files/']) {
      prisma.noStarWebDavConfig.findUnique = async () => ({url: base, username: 'reader', passwordEncrypted: encryptSecret('dav-password', encryptionKey)});
      const response = await app.inject({method: 'POST', url: '/api/nostar/proxy/webdav', headers: {cookie}, payload: {configId: 'webdav-1', method: 'GET', path: 'backup%2F..%2F..%2Foutside'}});
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('INVALID_WEBDAV_PATH');
    }
    expect(safeRequester).not.toHaveBeenCalled();
  });

  it('rejects WebDAV paths escaping the configured collection', async () => {
    await setupAdmin();
    const cookie = await loginSecondUser();
    for (const path of ['../other/', '%2e%2e/other/', '..%2fother/', '..%5cother/']) {
      const response = await app.inject({method: 'POST', url: '/api/nostar/proxy/webdav', headers: {cookie}, payload: {configId: 'webdav-1', method: 'GET', path}});
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('INVALID_WEBDAV_PATH');
    }
    expect(safeRequester).not.toHaveBeenCalled();
  });

  it('does not let bearer tokens use stored WebDAV credentials', async () => {
    await setupAdmin();
    const readerCookie = await loginSecondUser();
    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie: readerCookie },
      payload: { name: 'Full automation', scopes: ['*'] },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/nostar/proxy/webdav',
      headers: { authorization: `Bearer ${tokenResponse.json().data.token}` },
      payload: { configId: 'webdav-1', method: 'GET', path: '/backup/' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('SECRET_USE_FORBIDDEN');
    expect(safeRequester).not.toHaveBeenCalled();
  });

  it('does not let bearer tokens send stored NoStar credentials', async () => {
    await setupAdmin();
    const token = (await repo.createToken(1, 'Full automation', null, ['*'])).token;
    const headers = { authorization: `Bearer ${token}` };

    const tested = await app.inject({
      method: 'POST',
      url: '/api/admin/nostar/ai/test',
      headers,
      payload: { id: 'ai-1', baseUrl: 'https://attacker.example/collect' },
    });
    const proxied = await app.inject({
      method: 'POST',
      url: '/api/nostar/proxy/ai',
      headers,
      payload: { configId: 'ai-1', body: { messages: [] } },
    });
    const github = await app.inject({
      method: 'POST',
      url: '/api/nostar/proxy/github/graphql',
      headers,
      payload: { query: '{ viewer { login } }' },
    });

    expect([tested.statusCode, proxied.statusCode, github.statusCode]).toEqual([403, 403, 403]);
    expect(safeRequester).not.toHaveBeenCalled();
  });

  it('does not echo upstream AI response bodies from connection tests', async () => {
    const adminCookie = await setupAdmin();
    safeRequester.mockResolvedValueOnce({
      statusCode: 500,
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('internal-service-secret'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/nostar/ai/test',
      headers: { cookie: adminCookie },
      payload: { apiType: 'openai', baseUrl: 'https://ai.example', apiKey: 'key', model: 'model' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('internal-service-secret');
  });

  it('never reveals stored integration secrets to any browser client', async () => {
    const adminCookie = await setupAdmin();
    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie: adminCookie },
      payload: { name: 'Full automation', scopes: ['*'] },
    });
    const token = tokenResponse.json().data.token;

    const bearerResponse = await app.inject({
      method: 'GET',
      url: '/api/nostar/configs/ai?decrypt=true',
      headers: { authorization: `Bearer ${token}` },
    });
    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/nostar/configs/ai?decrypt=true',
      headers: { cookie: adminCookie },
    });

    expect(bearerResponse.statusCode).toBe(200);
    expect(bearerResponse.body).not.toContain('secret-ai-key');
    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()[0].apiKey).toBe('***-key');
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
