import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, FetchLlmClient } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { hashApiToken } from '../src/utils/crypto.js';
import { appearanceDefaults as webAppearanceDefaults } from '../../web/src/utils/appearance.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const adminPassword = 'Password2026!';

let app: FastifyInstance;
let repo: MemoryRepository;

async function setupAdmin() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: {
      username: 'admin',
      email: 'admin@nono.test',
      displayName: 'Admin',
      password: adminPassword,
    },
  });
  const cookie = response.headers['set-cookie'];
  return Array.isArray(cookie) ? cookie[0] : String(cookie);
}

async function setupUser(adminCookie: string, username = 'reader') {
  await app.inject({
    method: 'PUT',
    url: '/api/admin/config',
    headers: { cookie: adminCookie },
    payload: { allowRegistration: true },
  });
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username,
      email: `${username}@nono.test`,
      displayName: username,
      password: 'Reader2026!',
    },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: 'Reader2026!' },
  });
  const cookie = login.headers['set-cookie'];
  return {
    cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
    userId: registered.json().data.user.id as number,
  };
}

describe('NoNo Fastify app', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('returns a unified health response', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ code: 0, data: { ok: true }, message: '' });
  });

  it('separates liveness from dependency readiness', async () => {
    const readyApp = await buildApp({
      repo: new MemoryRepository(false),
      sessionSecret,
      encryptionKey,
      readinessCheck: async () => ({ postgres: true, nodesk: true, nomoney: true, yumi: true }),
    } as any);

    const live = await readyApp.inject({ method: 'GET', url: '/livez' });
    const ready = await readyApp.inject({ method: 'GET', url: '/readyz' });

    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      code: 0,
      data: { ok: true, checks: { postgres: true, nodesk: true, nomoney: true, yumi: true } },
      message: '',
    });
    await readyApp.close();
  });

  it('sends a content security policy that blocks third-party scripts and embedding', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    const policy = response.headers['content-security-policy'];

    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toMatch(/connect-src[^;]*(?:https?:|wss?:)/);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('upgrade-insecure-requests');
    expect(response.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });

  it('prevents browsers from caching API responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/session' });

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('does not reflect arbitrary browser origins but allows Chrome extensions', async () => {
    const untrusted = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: 'https://evil.example' } });
    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();

    const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const extension = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: extensionOrigin } });
    expect(extension.headers['access-control-allow-origin']).toBe(extensionOrigin);
  });

  it('rejects Chrome extension requests that try to reuse a browser session cookie', async () => {
    const cookie = await setupAdmin();
    const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/backup-center/local/all',
      headers: { origin: extensionOrigin, cookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it('requires the configured bootstrap token for initial administrator setup', async () => {
    const secured = await buildApp({
      repo: new MemoryRepository(false),
      sessionSecret,
      encryptionKey,
      bootstrapToken: 'bootstrap-secret',
    } as any);

    const denied = await secured.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'owner', password: 'secure12345', email: 'owner@example.com' },
    });
    const allowed = await secured.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'owner',
        password: 'secure12345',
        email: 'owner@example.com',
        bootstrapToken: 'bootstrap-secret',
      },
    });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    await secured.close();
  });

  it('requires a valid non-default encryption key in production', async () => {
    const buildError = async () => {
      try {
        const candidate = await buildApp({ repo: new MemoryRepository(false), sessionSecret });
        await candidate.close();
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(await buildError()).toBe('ENCRYPTION_KEY must be configured in production');

    vi.stubEnv('ENCRYPTION_KEY', encryptionKey);
    expect(await buildError()).toBe('ENCRYPTION_KEY must be configured in production');

    vi.stubEnv('ENCRYPTION_KEY', 'z'.repeat(64));
    expect(await buildError()).toBe('ENCRYPTION_KEY must be 64 hexadecimal characters');
  });

  it('requires a public origin in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NONO_PUBLIC_URL', '');
    vi.stubEnv('WEBAUTHN_ORIGIN', '');

    await expect(buildApp({
      repo: new MemoryRepository(false),
      sessionSecret,
      encryptionKey: 'abcdef0123456789'.repeat(4),
      bootstrapToken: 'bootstrap-token-that-is-long-enough',
    })).rejects.toThrow('NONO_PUBLIC_URL');
  });

  it('initializes an admin, logs in, and exposes the current session', async () => {
    const setupCookie = await setupAdmin();

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: adminPassword },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().data.user.role).toBe('admin');

    const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: setupCookie } });
    expect(session.statusCode).toBe(200);
    expect(session.json().data).toMatchObject({ authenticated: true, setupRequired: false });
  });

  it('rejects cross-site unsafe requests authenticated by a session cookie', async () => {
    const cookie = await setupAdmin();

    const crossSite = await app.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { cookie, 'sec-fetch-site': 'cross-site' },
      payload: { allowRegistration: true },
    });
    expect(crossSite.statusCode).toBe(403);

    const sameOrigin = await app.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { cookie, 'sec-fetch-site': 'same-origin' },
      payload: { allowRegistration: true },
    });
    expect(sameOrigin.statusCode).toBe(200);
  });

  it('requires the exact configured origin for session-authenticated writes', async () => {
    const csrfApp = await buildApp({
      repo: new MemoryRepository(false),
      sessionSecret,
      encryptionKey,
      webAuthnOrigin: 'https://nono.test',
    });
    const setup = await csrfApp.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'admin',
        email: 'admin@nono.test',
        displayName: 'Admin',
        password: adminPassword,
      },
    });
    const setCookie = setup.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);

    const missingOrigin = await csrfApp.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { cookie, 'sec-fetch-site': 'same-origin' },
      payload: { allowRegistration: true },
    });
    const mismatchedOrigin = await csrfApp.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { cookie, origin: 'https://other.nono.test', 'sec-fetch-site': 'same-site' },
      payload: { allowRegistration: true },
    });
    const matchingOrigin = await csrfApp.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { cookie, origin: 'https://nono.test' },
      payload: { allowRegistration: true },
    });

    expect(missingOrigin.statusCode).toBe(403);
    expect(mismatchedOrigin.statusCode).toBe(403);
    expect(matchingOrigin.statusCode).toBe(200);

    const createdToken = await csrfApp.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie, origin: 'https://nono.test' },
      payload: { name: 'Automation', scopes: ['*'] },
    });
    const bearerWrite = await csrfApp.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { authorization: `Bearer ${createdToken.json().data.token}` },
      payload: { name: 'Bearer automation' },
    });
    expect(bearerWrite.statusCode).toBe(200);

    await csrfApp.close();
  });

  it('rejects short and placeholder session secrets in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const productionEncryptionKey = 'abcdef0123456789'.repeat(4);

    for (const candidate of ['short', 'change-me-session-secret-that-is-long-enough', 'replace-with-a-long-random-session-secret']) {
      await expect(buildApp({
        repo: new MemoryRepository(false),
        sessionSecret: candidate,
        encryptionKey: productionEncryptionKey,
      })).rejects.toThrow('SESSION_SECRET');
    }
  });

  it('allows only one concurrent first-admin setup', async () => {
    const attempts = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { username: 'first-admin', email: 'first@nono.test', password: adminPassword },
      }),
      app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { username: 'second-admin', email: 'second@nono.test', password: adminPassword },
      }),
    ]);

    expect(attempts.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect((await repo.listUsers()).filter((user) => user.role === 'admin')).toHaveLength(1);
  });

  it('keeps login rate limits isolated by the forwarded client address', async () => {
    await setupAdmin();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.10' },
        payload: { username: 'admin', password: 'WrongPassword2026!' },
      });
      expect(response.statusCode).toBe(401);
    }

    const otherClient = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.11' },
      payload: { username: 'admin', password: 'WrongPassword2026!' },
    });
    expect(otherClient.statusCode).toBe(401);
  });

  it('serves the setup admin site through the root navigation alias', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'nono',
        email: 'nono@nono.test',
        displayName: 'NoNo',
        password: adminPassword,
      },
    });
    expect(setup.statusCode).toBe(200);

    const navigation = await app.inject({ method: 'GET', url: '/api/navigation/admin' });

    expect(navigation.statusCode).toBe(200);
    expect(navigation.json().data.site).toMatchObject({ slug: 'nono', userId: 1 });
  });

  it('serves the saved homepage background through the public navigation origin', async () => {
    await app.close();
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const publicFetcher = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(body.length) },
      body,
    });
    app = await buildApp({ repo, sessionSecret, encryptionKey, publicFetcher } as any);
    await setupAdmin();

    const response = await app.inject({ method: 'GET', url: '/api/navigation/admin/background' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toContain('stale-while-revalidate');
    expect(response.rawPayload).toEqual(body);
    expect(publicFetcher).toHaveBeenCalledWith('https://api.dujin.org/bing/1920.php', expect.objectContaining({
      maxBytes: expect.any(Number),
      timeoutMs: expect.any(Number),
    }));

    const cached = await app.inject({ method: 'GET', url: '/api/navigation/admin/background?retry=1' });
    expect(cached.statusCode).toBe(200);
    expect(cached.rawPayload).toEqual(body);
    expect(publicFetcher).toHaveBeenCalledTimes(1);
  });

  it('does not relay a non-image response as a homepage background', async () => {
    await app.close();
    const publicFetcher = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      body: Buffer.from('<html>upstream error</html>'),
    });
    app = await buildApp({ repo, sessionSecret, encryptionKey, publicFetcher } as any);
    await setupAdmin();

    const response = await app.inject({ method: 'GET', url: '/api/navigation/admin/background' });

    expect(response.statusCode).toBe(502);
  });

  it('never exposes private records or locked links through public navigation APIs', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie },
      payload: { name: 'Private', password: 'Folder2026!', passwordHint: 'Personal hint' },
    });
    const folderId = folder.json().data.id;
    const privateLink = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie },
      payload: { folderId, name: 'Secret', url: 'https://secret.example/' },
    });
    await repo.updateLinkHealth(1, [{
      id: privateLink.json().data.id,
      url: 'https://secret.example/',
      status: 'broken',
      statusCode: 404,
      reason: 'Internal health detail',
      checkedAt: new Date('2026-07-18T08:00:00.000Z'),
    }]);

    const navigation = await app.inject({ method: 'GET', url: '/api/navigation/admin' });
    const navigationBody = navigation.json();
    const publicFolder = navigationBody.data.folders.find((item: any) => item.id === folderId);
    expect(navigation.statusCode).toBe(200);
    expect(navigationBody.data.site).not.toHaveProperty('user');
    expect(publicFolder).toMatchObject({ id: folderId, locked: true, passwordHint: 'Personal hint', links: [] });
    expect(publicFolder).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(navigationBody)).not.toContain('llmApiKey');

    const legacy = await app.inject({ method: 'GET', url: '/api/v1/allsiteandlinks/admin' });
    const legacyFolder = legacy.json().data.folder_with_links.find((item: any) => item.id === folderId);
    expect(legacy.statusCode).toBe(200);
    expect(legacyFolder).toMatchObject({ id: folderId, locked: true, passwordHint: 'Personal hint', links: [] });
    expect(legacyFolder).not.toHaveProperty('passwordHash');

    const unlocked = await app.inject({
      method: 'POST',
      url: `/api/navigation/admin/folder/${folderId}/verify`,
      payload: { password: 'Folder2026!' },
    });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.json().data.links[0]).not.toHaveProperty('healthStatus');
    expect(unlocked.json().data.links[0]).not.toHaveProperty('healthReason');
  });

  it('keeps disabled registration and unauthenticated errors in the unified response envelope', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'reader', email: 'reader@nono.test', password: 'Reader2026!' },
    });
    expect(register.statusCode).toBe(403);
    expect(register.json()).toEqual({ code: 403, data: null, message: 'Registration is closed' });

    const folders = await app.inject({ method: 'GET', url: '/api/admin/folders' });
    expect(folders.statusCode).toBe(401);
    expect(folders.json()).toEqual({ code: 401, data: null, message: 'Authentication required' });
  });

  it('rejects oversized folder and bookmark fields before writing them', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie },
      payload: { name: 'x'.repeat(121) },
    });
    expect(folder.statusCode).toBe(400);

    const validFolder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie },
      payload: { name: 'Safe' },
    });
    const link = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie },
      payload: {
        folderId: validFolder.json().data.id,
        name: 'x'.repeat(241),
        url: 'https://example.com/',
      },
    });
    expect(link.statusCode).toBe(400);
    expect(await repo.listLinks(1)).toHaveLength(0);
  });

  it('creates API tokens and accepts bearer authentication', async () => {
    const cookie = await setupAdmin();
    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Automation', scopes: ['*'] },
    });
    expect(tokenResponse.statusCode).toBe(200);
    const token = tokenResponse.json().data.token;
    expect(repo.tokens[0]).toMatchObject({ tokenHash: hashApiToken(token), tokenPrefix: token.slice(0, 10) });
    expect(JSON.stringify(repo.tokens[0])).not.toContain(token);

    const listedTokens = await app.inject({ method: 'GET', url: '/api/admin/tokens', headers: { cookie } });
    expect(JSON.stringify(listedTokens.json())).not.toContain(hashApiToken(token));

    const folders = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'AI 工具', icon: 'sparkles' },
    });
    expect(folders.statusCode).toBe(200);
    expect(folders.json().data.name).toBe('AI 工具');
  });

  it('never grants administrator role through public registration', async () => {
    await setupAdmin();
    await repo.updateConfig({ allowRegistration: true, defaultRole: 'admin' });

    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'public-user',
        email: 'public-user@nono.test',
        password: adminPassword,
      },
    });

    expect(registered.statusCode).toBe(200);
    expect(registered.json().data.user.role).toBe('user');
  });

  it('limits extension tokens to bookmark and clip operations by default', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie },
      payload: { name: 'Inbox', icon: 'inbox' },
    });
    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Chrome extension' },
    });
    const token = tokenResponse.json().data.token;

    expect(tokenResponse.json().data.scopes).toEqual([
      'bookmarks:read', 'bookmarks:write', 'ai:analyze', 'clips:read', 'clips:write',
    ]);

    const folders = await app.inject({
      method: 'GET',
      url: '/api/admin/folders',
      headers: { authorization: `Bearer ${token}` },
    });
    const link = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { authorization: `Bearer ${token}` },
      payload: { folderId: folder.json().data.id, name: 'Example', url: 'https://example.com', description: '' },
    });
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Forbidden', icon: 'lock' },
    });

    expect(folders.statusCode).toBe(200);
    expect(link.statusCode).toBe(200);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().message).toBe('API token scope is insufficient');
  });

  it('normalizes site appearance settings and rejects unsafe portal URLs', async () => {
    const cookie = await setupAdmin();
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie },
      payload: {
        settings: {
          analytics: { enabled: true },
          appearance: {
            cardColor: 'transparent',
            cardRadius: 999,
            searchColor: '#A1B2C3',
            bookmarkTextColor: '#112233',
            bookmarkTextSize: 99,
            notabTextColor: '#223344',
            notabTextSize: '16',
            folderTextColor: '#334455',
            folderTextSize: 8,
            categoryTextColor: null,
            tabColor: '#DDEEFF',
            modalOpacity: '38',
            tabBlur: -12,
            adminBlur: {},
          },
        },
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.settings).toMatchObject({
      analytics: { enabled: true },
      appearance: {
        cardColor: '#f7f8fb',
        cardRadius: 24,
        searchColor: '#a1b2c3',
        bookmarkTextColor: '#112233',
        bookmarkTextSize: 18,
        notabTextColor: '#223344',
        notabTextSize: 16,
        folderTextColor: '#334455',
        folderTextSize: 12,
        categoryTextColor: '#334455',
        tabColor: '#a1b2c3',
        modalOpacity: 26,
        tabBlur: 20,
        adminBlur: 10,
      },
    });

    const unsafe = await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie },
      payload: {
        settings: {
          portal: {
            enabled: true,
            url: 'javascript:alert(1)',
            label: 'Unsafe',
            imageUrl: '',
            openInNewTab: false,
          },
        },
      },
    });

    expect(unsafe.statusCode).toBe(400);
  });

  it('round-trips every public appearance setting through the site API', async () => {
    const cookie = await setupAdmin();
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie },
      payload: { settings: { appearance: webAppearanceDefaults } },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.settings.appearance).toEqual(webAppearanceDefaults);
  });

  it('sends LLM requests through the safe outbound requester', async () => {
    const requester = vi.fn(async () => ({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"choices":[{"message":{"content":"{\\"ok\\":true}"}}]}'),
    }));
    const client = new FetchLlmClient(requester as any);

    await expect(client.complete({
      provider: 'openai',
      apiKey: 'secret',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.example/v1',
      prompt: 'test',
    })).resolves.toBe('{"ok":true}');

    expect(requester).toHaveBeenCalledWith(
      'https://api.example/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('normalizes navigation entries and rejects unsafe entry URLs', async () => {
    const cookie = await setupAdmin();
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie },
      payload: {
        settings: {
          navigationEntries: [
            { id: 'NoMoney', label: ' NoMoney ', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false },
            { id: 'NoMoney', label: 'Status', url: 'https://status.example.com', icon: 'activity', enabled: true, openInNewTab: true },
          ],
        },
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.settings.navigationEntries).toEqual([
      { id: 'nomoney', label: 'NoMoney', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false },
      { id: 'nomoney-2', label: 'Status', url: 'https://status.example.com', icon: 'activity', enabled: true, openInNewTab: true },
    ]);

    const unsafe = await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie },
      payload: {
        settings: {
          navigationEntries: [
            { id: 'unsafe', label: 'Unsafe', url: 'javascript:alert(1)', icon: 'link', enabled: true, openInNewTab: false },
          ],
        },
      },
    });

    expect(unsafe.statusCode).toBe(400);
  });

  it('summarizes token governance and rejects expired token creation', async () => {
    const cookie = await setupAdmin();
    const neverExpires = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Permanent token' },
    });
    expect(neverExpires.statusCode).toBe(200);

    const expired = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Expired token', expiresAt: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(expired.statusCode).toBe(400);

    const future = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Future token', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
    });
    expect(future.statusCode).toBe(200);

    const summary = await app.inject({ method: 'GET', url: '/api/admin/tokens/summary', headers: { cookie } });

    expect(summary.statusCode).toBe(200);
    expect(summary.json().data).toMatchObject({ total: 2, active: 2, expired: 0, neverExpires: 1, expiringSoon: 0 });
  });

  it('returns metadata for the current bearer token', async () => {
    const cookie = await setupAdmin();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Extension token', expiresAt },
    });
    const token = tokenResponse.json().data.token;

    const current = await app.inject({
      method: 'GET',
      url: '/api/admin/tokens/current',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(current.statusCode).toBe(200);
    expect(current.json().data).toMatchObject({
      name: 'Extension token',
      expiresAt,
      scopes: ['bookmarks:read', 'bookmarks:write', 'ai:analyze', 'clips:read', 'clips:write'],
    });
    expect(current.json().data.token).toContain('...');
  });

  /**
   * Stored tokens are never silently widened. A token issued before Clipper existed keeps the
   * scopes it was created with until its owner amends them deliberately.
   */
  it('amends the scopes of an existing token without reissuing it', async () => {
    const cookie = await setupAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Legacy token', scopes: ['bookmarks:read', 'bookmarks:write'] },
    });
    const token = created.json().data.token;
    const id = created.json().data.id;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/admin/tokens/${id}`,
      headers: { cookie },
      payload: { scopes: ['bookmarks:read', 'bookmarks:write', 'clips:read', 'clips:write'] },
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.scopes).toEqual(['bookmarks:read', 'bookmarks:write', 'clips:read', 'clips:write']);

    // The secret itself is unchanged, so the extension does not have to be reconfigured.
    const current = await app.inject({
      method: 'GET',
      url: '/api/admin/tokens/current',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().data.scopes).toContain('clips:write');
  });

  it('refuses to amend token scopes from a bearer caller', async () => {
    const cookie = await setupAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Self-escalating token', scopes: ['bookmarks:read'] },
    });
    const token = created.json().data.token;
    const id = created.json().data.id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/tokens/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { scopes: ['*'] },
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects an unknown scope', async () => {
    const cookie = await setupAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: 'Token', scopes: ['bookmarks:read'] },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/tokens/${created.json().data.id}`,
      headers: { cookie },
      payload: { scopes: ['clips:everything'] },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('does not amend a token belonging to another user', async () => {
    const adminCookie = await setupAdmin();
    const other = await setupUser(adminCookie, 'reader');
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie: adminCookie },
      payload: { name: 'Admin token', scopes: ['bookmarks:read'] },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/tokens/${created.json().data.id}`,
      headers: { cookie: other.cookie },
      payload: { scopes: ['*'] },
    });

    expect(response.statusCode).toBe(404);
  });

  it('imports and exports Netscape browser bookmarks', async () => {
    const cookie = await setupAdmin();
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Dev</H3><DL><p><DT><A HREF="https://github.com/">GitHub</A></DL><p></DL><p>';

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: { html },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().data).toMatchObject({ addedFolders: 1, addedLinks: 1, skippedDuplicates: 0 });

    const exported = await app.inject({ method: 'GET', url: '/api/admin/bookmarks/export', headers: { cookie } });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('text/html');
    expect(exported.body).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(exported.body).toContain('https://github.com/');
  });

  it('previews bookmark imports without writing folders or links', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Existing' } });
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: 1, name: 'GitHub', url: 'https://github.com/' } });
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Dev</H3><DL><p><DT><A HREF="https://github.com/">GitHub</A><DT><A HREF="https://example.com/">Example</A><DT><A HREF="chrome://bookmarks/">Chrome</A></DL><p></DL><p>';

    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/preview',
      headers: { cookie },
      payload: { html },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json().data.summary).toMatchObject({
      parsedFolders: 1,
      parsedLinks: 3,
      newFolders: 1,
      newLinks: 1,
      duplicateLinks: 1,
      invalidLinks: 1,
    });
    expect(await repo.listFolders(1)).toHaveLength(1);
    expect(await repo.listLinks(1)).toHaveLength(1);
  });

  it('promotes folders below the Bookmarks wrapper and ignores sibling roots', async () => {
    const cookie = await setupAdmin();
    const html = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>',
      '<DT><H3>Outside</H3><DL><p><DT><A HREF="https://outside.example/">Outside link</A></DL><p>',
      '<DT><H3>Bookmarks</H3><DL><p>',
      '<DT><H3>Work</H3><DL><p><DT><A HREF="https://work.example/">Work link</A></DL><p>',
      '<DT><H3>Life</H3><DL><p><DT><A HREF="https://life.example/">Life link</A></DL><p>',
      '</DL><p></DL><p>',
    ].join('');

    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/preview',
      headers: { cookie },
      payload: { html },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json().data.folders).toEqual([
      expect.objectContaining({ tempId: 'folder-3', parentTempId: null, name: 'Work' }),
      expect.objectContaining({ tempId: 'folder-4', parentTempId: null, name: 'Life' }),
    ]);
    expect(preview.json().data.links.map((link: any) => link.name)).toEqual(['Work link', 'Life link']);
    expect(preview.json().data.summary).toMatchObject({ ignoredFolders: 1, ignoredLinks: 1 });

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: { html },
    });

    expect(imported.statusCode).toBe(200);
    expect((await repo.listFolders(1)).map((folder) => ({ name: folder.name, parentId: folder.parentId }))).toEqual([
      { name: 'Work', parentId: null },
      { name: 'Life', parentId: null },
    ]);
    expect((await repo.listLinks(1)).map((link) => link.name)).toEqual(['Work link', 'Life link']);
  });

  it('treats the Chrome Bookmarks bar as an import wrapper', async () => {
    const cookie = await setupAdmin();
    const html = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>',
      '<DT><H3>Bookmarks bar</H3><DL><p>',
      '<DT><H3>Lighting</H3><DL><p>',
      '<DT><H3>微光</H3><DL><p><DT><A HREF="https://glimmer.example/">微光</A></DL><p>',
      '<DT><H3>Gather</H3><DL><p><DT><A HREF="https://gather.example/">Gather</A></DL><p>',
      '</DL><p></DL><p></DL><p>',
    ].join('');

    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/preview',
      headers: { cookie },
      payload: { html },
    });

    expect(preview.statusCode).toBe(200);
    const previewFolders = preview.json().data.folders;
    const lighting = previewFolders.find((folder: any) => folder.name === 'Lighting');
    expect(previewFolders.map((folder: any) => folder.name)).toEqual(['Lighting', '微光', 'Gather']);
    expect(lighting.parentTempId).toBeNull();
    expect(previewFolders.find((folder: any) => folder.name === '微光').parentTempId).toBe(lighting.tempId);
    expect(previewFolders.find((folder: any) => folder.name === 'Gather').parentTempId).toBe(lighting.tempId);

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: { html },
    });

    expect(imported.statusCode).toBe(200);
    const importedFolders = await repo.listFolders(1);
    const importedLighting = importedFolders.find((folder) => folder.name === 'Lighting');
    expect(importedFolders.map((folder) => folder.name)).toEqual(['Lighting', '微光', 'Gather']);
    expect(importedLighting?.parentId).toBeNull();
    expect(importedFolders.find((folder) => folder.name === '微光')?.parentId).toBe(importedLighting?.id);
    expect(importedFolders.find((folder) => folder.name === 'Gather')?.parentId).toBe(importedLighting?.id);
  });

  it('imports only selected preview folders and links', async () => {
    const cookie = await setupAdmin();
    const html = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Bookmarks</H3><DL><p>',
      '<DT><H3>Work</H3><DL><p>',
      '<DT><A HREF="https://one.example/">One</A>',
      '<DT><A HREF="https://two.example/">Two</A>',
      '</DL><p>',
      '<DT><H3>Skip me</H3><DL><p><DT><A HREF="https://skip.example/">Skip</A></DL><p>',
      '</DL><p></DL><p>',
    ].join('');

    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/preview',
      headers: { cookie },
      payload: { html },
    });
    const data = preview.json().data;
    const work = data.folders.find((folder: any) => folder.name === 'Work');
    const one = data.links.find((link: any) => link.name === 'One');

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: {
        html,
        selection: {
          folderTempIds: [work.tempId],
          linkTempIds: [one.tempId],
        },
      },
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.json().data).toMatchObject({ addedFolders: 1, addedLinks: 1 });
    expect((await repo.listFolders(1)).map((folder) => folder.name)).toEqual(['Work']);
    expect((await repo.listLinks(1)).map((link) => link.name)).toEqual(['One']);
  });

  it('uses PostgreSQL-safe sort order values when importing bookmarks', async () => {
    const cookie = await setupAdmin();
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Tools</H3><DL><p><DT><A HREF="https://example.com/">Example</A></DL><p></DL><p>';

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: { html },
    });
    expect(imported.statusCode).toBe(200);

    const [folder] = await repo.listFolders(1);
    const [link] = await repo.listLinks(1);
    expect(folder.sortOrder).toBeLessThanOrEqual(2_147_483_647);
    expect(link.sortOrder).toBeLessThanOrEqual(2_147_483_647);
  });

  it('appends newly created folders and links after existing items', async () => {
    const cookie = await setupAdmin();
    const firstFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'First', sortOrder: 1000 } });
    const secondFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Second' } });
    const folderId = firstFolder.json().data.id;
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'One', url: 'https://one.example/', sortOrder: 1000 } });
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Two', url: 'https://two.example/' } });

    expect((await repo.listFolders(1)).map((folder) => folder.name)).toEqual(['First', 'Second']);
    expect((await repo.listLinks(1)).map((link) => link.name)).toEqual(['One', 'Two']);
    expect(secondFolder.json().data.sortOrder).toBeLessThanOrEqual(firstFolder.json().data.sortOrder);
  });

  it('records public bookmark clicks for common-bookmark ranking', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Common' } });
    const link = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie },
      payload: { folderId: folder.json().data.id, name: 'Docs', url: 'https://docs.example/' },
    });
    const linkId = link.json().data.id;

    const first = await app.inject({ method: 'POST', url: `/api/navigation/admin/links/${linkId}/click` });
    const second = await app.inject({ method: 'POST', url: `/api/navigation/admin/links/${linkId}/click` });
    const missing = await app.inject({ method: 'POST', url: '/api/navigation/admin/links/999999/click' });
    const links = await app.inject({ method: 'GET', url: '/api/admin/links', headers: { cookie } });

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    expect(missing.statusCode).toBe(404);
    expect(links.json().data.find((item: any) => item.id === linkId)).toMatchObject({ clickCount: 2 });
  });

  it('moves a folder to the end of another notab', async () => {
    const cookie = await setupAdmin();
    const source = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Source' } });
    const target = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Target' } });
    const existing = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Existing', parentId: target.json().data.id, sortOrder: 1000 } });
    const moving = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Moving', parentId: source.json().data.id, sortOrder: 2000 } });

    const moved = await app.inject({
      method: 'PUT',
      url: `/api/admin/folders/${moving.json().data.id}`,
      headers: { cookie },
      payload: { parentId: target.json().data.id },
    });

    expect(moved.statusCode).toBe(200);
    expect(moved.json().data.parentId).toBe(target.json().data.id);
    expect(moved.json().data.sortOrder).toBeLessThanOrEqual(existing.json().data.sortOrder);
  });

  it('skips browser-only bookmark URLs and data icons during import', async () => {
    const cookie = await setupAdmin();
    const html = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>',
      '<DT><H3>Chrome Export</H3><DL><p>',
      '<DT><A HREF="https://example.com/article" ICON="data:image/png;base64,abc123">Article</A>',
      '<DT><A HREF="chrome://bookmarks/">Bookmarks</A>',
      '<DT><A HREF="javascript:alert(1)">Bookmarklet</A>',
      '</DL><p></DL><p>',
    ].join('');

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/bookmarks/import',
      headers: { cookie },
      payload: { html },
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.json().data).toMatchObject({ addedFolders: 1, addedLinks: 1, skippedDuplicates: 0, skippedInvalid: 2 });
    const links = await repo.listLinks(1);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ name: 'Article', url: 'https://example.com/article', icon: '' });
  });

  it('persists manual link sorting within a folder', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Manual' } });
    const folderId = folder.json().data.id;
    const first = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'First', url: 'https://first.example/' } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Second', url: 'https://second.example/' } });
    const third = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Third', url: 'https://third.example/' } });

    const reorder = await app.inject({
      method: 'PUT',
      url: '/api/admin/links/reorder',
      headers: { cookie },
      payload: { ids: [second.json().data.id, first.json().data.id, third.json().data.id] },
    });

    expect(reorder.statusCode).toBe(200);
    const links = await repo.listLinks(1);
    expect(links.map((link) => link.name)).toEqual(['Second', 'First', 'Third']);
  });

  it('moves one bookmark across folders and persists both folder orders atomically', async () => {
    const cookie = await setupAdmin();
    const source = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Source' } });
    const target = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Target' } });
    const sourceId = source.json().data.id;
    const targetId = target.json().data.id;
    const moving = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: sourceId, name: 'Moving', url: 'https://moving.example/' } });
    const remaining = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: sourceId, name: 'Remaining', url: 'https://remaining.example/' } });
    const existing = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: targetId, name: 'Existing', url: 'https://existing.example/' } });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/links/move',
      headers: { cookie },
      payload: {
        linkId: moving.json().data.id,
        targetFolderId: targetId,
        sourceIds: [remaining.json().data.id],
        targetIds: [existing.json().data.id, moving.json().data.id],
      },
    });

    expect(response.statusCode).toBe(200);
    const links = await repo.listLinks(1);
    expect(links.filter((link) => link.folderId === sourceId).map((link) => link.name)).toEqual(['Remaining']);
    expect(links.filter((link) => link.folderId === targetId).map((link) => link.name)).toEqual(['Existing', 'Moving']);
  });

  it('rejects a stale cross-folder bookmark order without partially moving the bookmark', async () => {
    const cookie = await setupAdmin();
    const source = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Source' } });
    const target = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Target' } });
    const sourceId = source.json().data.id;
    const targetId = target.json().data.id;
    const moving = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: sourceId, name: 'Moving', url: 'https://moving.example/' } });
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: targetId, name: 'Existing', url: 'https://existing.example/' } });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/links/move',
      headers: { cookie },
      payload: {
        linkId: moving.json().data.id,
        targetFolderId: targetId,
        sourceIds: [],
        targetIds: [moving.json().data.id],
      },
    });

    expect(response.statusCode).toBe(409);
    const unchanged = (await repo.listLinks(1)).find((link) => link.id === moving.json().data.id);
    expect(unchanged?.folderId).toBe(sourceId);
  });

  it('moves deleted bookmarks, folders, and notabs through the recycle bin lifecycle', async () => {
    const cookie = await setupAdmin();
    const notab = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Projects' } });
    const notabId = notab.json().data.id;
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Research', parentId: notabId } });
    const folderId = folder.json().data.id;
    const bookmark = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Paper', url: 'https://paper.example/' } });
    const bookmarkId = bookmark.json().data.id;

    const removed = await app.inject({ method: 'DELETE', url: `/api/admin/folders/${folderId}`, headers: { cookie } });
    expect(removed.statusCode).toBe(200);
    expect((await repo.listFolders(1)).some((item) => item.id === folderId)).toBe(false);
    expect((await repo.listLinks(1)).some((item) => item.id === bookmarkId)).toBe(false);

    const trashResponse = await app.inject({ method: 'GET', url: '/api/admin/trash', headers: { cookie } });
    expect(trashResponse.statusCode).toBe(200);
    expect(trashResponse.json().data).toEqual([
      expect.objectContaining({ kind: 'folder', entityId: folderId, label: 'Research' }),
    ]);
    const trashId = trashResponse.json().data[0].id;

    const restored = await app.inject({ method: 'POST', url: `/api/admin/trash/${trashId}/restore`, headers: { cookie } });
    expect(restored.statusCode).toBe(200);
    expect((await repo.listFolders(1)).some((item) => item.id === folderId && item.parentId === notabId)).toBe(true);
    expect((await repo.listLinks(1)).some((item) => item.id === bookmarkId && item.folderId === folderId)).toBe(true);

    await app.inject({ method: 'DELETE', url: `/api/admin/folders/${notabId}`, headers: { cookie } });
    const notabTrash = (await app.inject({ method: 'GET', url: '/api/admin/trash', headers: { cookie } })).json().data[0];
    expect(notabTrash).toEqual(expect.objectContaining({ kind: 'notab', entityId: notabId, label: 'Projects' }));
    const restoredNotab = await app.inject({ method: 'POST', url: `/api/admin/trash/${notabTrash.id}/restore`, headers: { cookie } });
    expect(restoredNotab.statusCode).toBe(200);
    expect((await repo.listFolders(1)).some((item) => item.id === folderId && item.parentId === notabId)).toBe(true);
    expect((await repo.listLinks(1)).some((item) => item.id === bookmarkId && item.folderId === folderId)).toBe(true);

    await app.inject({ method: 'DELETE', url: `/api/admin/links/${bookmarkId}`, headers: { cookie } });
    const bookmarkTrash = (await app.inject({ method: 'GET', url: '/api/admin/trash', headers: { cookie } })).json().data[0];
    expect(bookmarkTrash).toEqual(expect.objectContaining({ kind: 'bookmark', entityId: bookmarkId, label: 'Paper' }));
    const purged = await app.inject({ method: 'DELETE', url: `/api/admin/trash/${bookmarkTrash.id}`, headers: { cookie } });
    expect(purged.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/trash', headers: { cookie } })).json().data).toEqual([]);
  });

  it('persists link sorting through one repository batch operation', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Batch links' } });
    const folderId = folder.json().data.id;
    const first = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'First', url: 'https://first.example/' } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Second', url: 'https://second.example/' } });
    const batch = vi.spyOn(repo, 'reorderLinks');
    const sequential = vi.spyOn(repo, 'updateLink');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/links/reorder',
      headers: { cookie },
      payload: { ids: [second.json().data.id, second.json().data.id, first.json().data.id, 'invalid'] },
    });

    expect(response.statusCode).toBe(200);
    expect(batch).toHaveBeenCalledOnce();
    expect(batch).toHaveBeenCalledWith(1, [second.json().data.id, first.json().data.id]);
    expect(sequential).not.toHaveBeenCalled();
  });

  it('persists folder sorting through one repository batch operation', async () => {
    const cookie = await setupAdmin();
    const first = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'First' } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Second' } });
    const batch = vi.spyOn(repo, 'reorderFolders');
    const sequential = vi.spyOn(repo, 'updateFolder');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/folders/reorder',
      headers: { cookie },
      payload: { ids: [second.json().data.id, second.json().data.id, first.json().data.id, 0] },
    });

    expect(response.statusCode).toBe(200);
    expect(batch).toHaveBeenCalledOnce();
    expect(batch).toHaveBeenCalledWith(1, [second.json().data.id, first.json().data.id]);
    expect(sequential).not.toHaveBeenCalled();
  });

  it('reports duplicate admin links by normalized URL', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Tools' } });
    const folderId = folder.json().data.id;
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'GitHub A', url: 'https://github.com/' } });
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'GitHub B', url: 'https://github.com' } });

    const duplicates = await app.inject({ method: 'GET', url: '/api/admin/links/duplicates', headers: { cookie } });

    expect(duplicates.statusCode).toBe(200);
    expect(duplicates.json().data.groups).toHaveLength(1);
    expect(duplicates.json().data.groups[0].links.map((link: any) => link.name)).toEqual(['GitHub A', 'GitHub B']);
  });

  it('bulk moves and bulk deletes admin links', async () => {
    const cookie = await setupAdmin();
    const firstFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Inbox' } });
    const secondFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Archive' } });
    const inboxId = firstFolder.json().data.id;
    const archiveId = secondFolder.json().data.id;
    const first = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: inboxId, name: 'One', url: 'https://one.example/' } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: inboxId, name: 'Two', url: 'https://two.example/' } });

    const move = await app.inject({
      method: 'POST',
      url: '/api/admin/links/bulk-move',
      headers: { cookie },
      payload: { ids: [first.json().data.id, second.json().data.id], folderId: archiveId },
    });
    expect(move.statusCode).toBe(200);
    expect(move.json().data).toEqual({ moved: 2 });

    const deleteResult = await app.inject({
      method: 'POST',
      url: '/api/admin/links/bulk-delete',
      headers: { cookie },
      payload: { ids: [first.json().data.id, second.json().data.id] },
    });
    expect(deleteResult.statusCode).toBe(200);
    expect(deleteResult.json().data).toEqual({ deleted: 2 });
    expect(await repo.listLinks(1)).toHaveLength(0);
  });

  it('bulk deletes selected folder trees and their bookmarks', async () => {
    const cookie = await setupAdmin();
    const root = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Root' } });
    const child = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Child', parentId: root.json().data.id } });
    const keep = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Keep' } });
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: child.json().data.id, name: 'Delete', url: 'https://delete.example/' } });
    await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: keep.json().data.id, name: 'Keep', url: 'https://keep.example/' } });

    const result = await app.inject({
      method: 'POST',
      url: '/api/admin/folders/bulk-delete',
      headers: { cookie },
      payload: { ids: [root.json().data.id, root.json().data.id, 0] },
    });

    expect(result.statusCode).toBe(200);
    expect(result.json().data).toEqual({ deletedFolders: 2, deletedLinks: 1 });
    expect((await repo.listFolders(1)).map((folder) => folder.name)).toEqual(['Keep']);
    expect((await repo.listLinks(1)).map((link) => link.name)).toEqual(['Keep']);
  });

  it('checks selected admin links through the safe requester and persists their health', async () => {
    await app.close();
    const safeRequester = vi.fn(async (url: string) => ({
      statusCode: url.includes('broken.example') ? 404 : 200,
      headers: {},
      body: Buffer.alloc(0),
      finalUrl: url,
    }));
    app = await buildApp({ repo, sessionSecret, encryptionKey, safeRequester: safeRequester as any });
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Quality' } });
    const folderId = folder.json().data.id;
    const ok = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'OK', url: 'https://ok.example/' } });
    const broken = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'Broken', url: 'https://broken.example/' } });
    const invalid = await repo.createLink({ folderId, name: 'Chrome', url: 'chrome://bookmarks/', icon: '', description: '', sortOrder: 10 });
    const health = await app.inject({
      method: 'POST',
      url: '/api/admin/links/health-check',
      headers: { cookie },
      payload: { ids: [ok.json().data.id, broken.json().data.id, invalid.id] },
    });
    expect(health.statusCode).toBe(200);
    expect(health.json().data.summary).toMatchObject({ total: 3, ok: 1, broken: 1, invalid: 1, timeout: 0 });
    expect(Object.fromEntries(health.json().data.results.map((result: any) => [result.id, result.status]))).toEqual({
      [ok.json().data.id]: 'ok',
      [broken.json().data.id]: 'broken',
      [invalid.id]: 'invalid',
    });
    expect(safeRequester).toHaveBeenCalledTimes(3);
    expect(safeRequester).toHaveBeenNthCalledWith(2, 'https://broken.example/', expect.objectContaining({ method: 'HEAD' }));
    expect(safeRequester).toHaveBeenNthCalledWith(3, 'https://broken.example/', expect.objectContaining({ method: 'GET' }));
    const persisted = Object.fromEntries((await repo.listLinks(1)).map((link) => [link.id, link]));
    expect(persisted[ok.json().data.id]).toMatchObject({ healthStatus: 'ok', healthStatusCode: 200 });
    expect(persisted[broken.json().data.id]).toMatchObject({ healthStatus: 'broken', healthStatusCode: 404 });
    expect(persisted[invalid.id]).toMatchObject({ healthStatus: 'invalid', healthReason: 'URL must start with http:// or https://' });
  });

  it('does not grant regular users the administrator private-host allowlist', async () => {
    await app.close();
    const safeRequester = vi.fn(async (url: string) => ({ statusCode: 200, headers: {}, body: Buffer.alloc(0), finalUrl: url }));
    app = await buildApp({
      repo,
      sessionSecret,
      encryptionKey,
      safeRequester: safeRequester as any,
      privateOutboundHosts: ['bookmarks.lan'],
    });
    const adminCookie = await setupAdmin();
    const reader = await setupUser(adminCookie);
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie: reader.cookie }, payload: { name: 'Reader' } });
    const link = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie: reader.cookie },
      payload: { folderId: folder.json().data.id, name: 'LAN', url: 'http://bookmarks.lan/' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/admin/links/health-check',
      headers: { cookie: reader.cookie },
      payload: { ids: [link.json().data.id] },
    });

    expect(safeRequester).toHaveBeenCalledWith('http://bookmarks.lan/', expect.objectContaining({ allowPrivateHosts: [] }));
  });

  it('does not offer reachable redirects for repair or touch another user links', async () => {
    await app.close();
    const safeRequester = vi.fn(async (url: string) => ({
      statusCode: 200,
      headers: {},
      body: Buffer.alloc(0),
      finalUrl: url.replace('http://old.example', 'https://new.example'),
    }));
    app = await buildApp({ repo, sessionSecret, encryptionKey, safeRequester: safeRequester as any });
    const adminCookie = await setupAdmin();
    const reader = await setupUser(adminCookie);
    const adminFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie: adminCookie }, payload: { name: 'Admin' } });
    const readerFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie: reader.cookie }, payload: { name: 'Reader' } });
    const adminLink = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie: adminCookie },
      payload: { folderId: adminFolder.json().data.id, name: 'Moved', url: 'http://old.example/docs' },
    });
    const readerLink = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie: reader.cookie },
      payload: { folderId: readerFolder.json().data.id, name: 'Reader moved', url: 'http://old.example/private' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/admin/links/health-check',
      headers: { cookie: adminCookie },
      payload: { ids: [adminLink.json().data.id] },
    });
    await app.inject({
      method: 'POST',
      url: '/api/admin/links/health-check',
      headers: { cookie: reader.cookie },
      payload: { ids: [readerLink.json().data.id] },
    });

    const repaired = await app.inject({
      method: 'POST',
      url: '/api/admin/links/health-repair',
      headers: { cookie: adminCookie },
      payload: { ids: [adminLink.json().data.id, readerLink.json().data.id] },
    });

    expect(repaired.statusCode).toBe(200);
    expect(repaired.json().data).toMatchObject({ repaired: 0, skipped: 2, links: [] });
    expect((await repo.listLinks(1))[0]).toMatchObject({
      id: adminLink.json().data.id,
      url: 'http://old.example/docs',
      healthStatus: 'ok',
      healthFinalUrl: null,
    });
    expect((await repo.listLinks(reader.userId))[0].url).toBe('http://old.example/private');
  });

  it('clears stale health metadata when a link URL changes', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Health' } });
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie },
      payload: { folderId: folder.json().data.id, name: 'Old', url: 'https://old.example/' },
    });
    await repo.updateLinkHealth(1, [{
      id: created.json().data.id,
      url: 'https://old.example/',
      status: 'broken',
      statusCode: 404,
      reason: 'Not found',
      checkedAt: new Date('2026-07-18T08:00:00.000Z'),
    }]);

    const renamed = await app.inject({
      method: 'PUT',
      url: `/api/admin/links/${created.json().data.id}`,
      headers: { cookie },
      payload: { name: 'Renamed', url: 'https://old.example/' },
    });
    expect(renamed.json().data).toMatchObject({
      name: 'Renamed',
      healthStatus: 'broken',
      healthStatusCode: 404,
    });

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/admin/links/${created.json().data.id}`,
      headers: { cookie },
      payload: { url: 'https://new.example/' },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({ url: 'https://new.example/', healthStatus: null, healthCheckedAt: null });

    await repo.updateLinkHealth(1, [{
      id: created.json().data.id,
      url: 'https://old.example/',
      status: 'broken',
      statusCode: 410,
      checkedAt: new Date('2026-07-18T09:00:00.000Z'),
    }]);
    expect((await repo.listLinks(1))[0]).toMatchObject({ url: 'https://new.example/', healthStatus: null });
  });

  it('automatically checks only links whose persisted health is due', async () => {
    await app.close();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'));
    vi.stubEnv('LINK_HEALTH_CHECK_ENABLED', 'true');
    vi.stubEnv('LINK_HEALTH_CHECK_INTERVAL_HOURS', '24');
    vi.stubEnv('LINK_HEALTH_CHECK_START_DELAY_SECONDS', '1');
    const user = await repo.createUser({
      username: 'scheduled',
      email: 'scheduled@nono.test',
      displayName: 'Scheduled',
      passwordHash: 'unused',
      role: 'admin',
    });
    const folder = await repo.createFolder({ userId: user.id, parentId: null, name: 'Scheduled', icon: '', description: '', sortOrder: 100 });
    const due = await repo.createLink({ folderId: folder.id, name: 'Due', url: 'https://due.example/', icon: '', description: '', sortOrder: 100 });
    const fresh = await repo.createLink({ folderId: folder.id, name: 'Fresh', url: 'https://fresh.example/', icon: '', description: '', sortOrder: 90 });
    await repo.updateLinkHealth(user.id, [{ id: fresh.id, url: fresh.url, status: 'ok', statusCode: 200, checkedAt: new Date('2026-07-18T11:00:00.000Z') }]);
    const safeRequester = vi.fn(async (url: string) => ({ statusCode: 200, headers: {}, body: Buffer.alloc(0), finalUrl: url }));

    try {
      app = await buildApp({ repo, sessionSecret, encryptionKey, safeRequester: safeRequester as any });
      await app.ready();
      await vi.advanceTimersByTimeAsync(1000);

      expect(safeRequester).toHaveBeenCalledTimes(1);
      expect(safeRequester.mock.calls[0][0]).toBe('https://due.example/');
      expect((await repo.listLinks(user.id)).find((link) => link.id === due.id)).toMatchObject({
        healthStatus: 'ok',
        healthStatusCode: 200,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('excludes disabled and private links from manual health checks', async () => {
    await app.close();
    const safeRequester = vi.fn(async (url: string) => ({ statusCode: 200, headers: {}, body: Buffer.alloc(0), finalUrl: url }));
    app = await buildApp({ repo, sessionSecret, encryptionKey, safeRequester: safeRequester as any });
    const cookie = await setupAdmin();
    const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Local' } });
    const publicLink = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: folder.json().data.id, name: 'Public', url: 'https://public.example/' } });
    const privateLink = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: folder.json().data.id, name: 'Printer', url: 'http://192.168.223.1/' } });
    const disabledLink = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: folder.json().data.id, name: 'Disabled', url: 'https://disabled.example/' } });
    const disabled = await app.inject({
      method: 'PUT',
      url: `/api/admin/links/${disabledLink.json().data.id}`,
      headers: { cookie },
      payload: { healthCheckEnabled: false },
    });

    const health = await app.inject({
      method: 'POST',
      url: '/api/admin/links/health-check',
      headers: { cookie },
      payload: { ids: [publicLink.json().data.id, privateLink.json().data.id, disabledLink.json().data.id] },
    });

    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().data).toMatchObject({ healthCheckEnabled: false, healthStatus: null, healthCheckedAt: null });
    expect(health.json().data.summary.total).toBe(1);
    expect(health.json().data.results.map((item: any) => item.id)).toEqual([publicLink.json().data.id]);
    expect(safeRequester).toHaveBeenCalledTimes(1);
    expect((await repo.listLinks(1)).find((link) => link.id === privateLink.json().data.id)).toMatchObject({ healthCheckEnabled: false });
  });

  it('does not schedule disabled or private links', async () => {
    await app.close();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'));
    vi.stubEnv('LINK_HEALTH_CHECK_ENABLED', 'true');
    vi.stubEnv('LINK_HEALTH_CHECK_START_DELAY_SECONDS', '1');
    const user = await repo.createUser({ username: 'skip-health', email: 'skip-health@nono.test', displayName: 'Skip', passwordHash: 'unused', role: 'admin' });
    const folder = await repo.createFolder({ userId: user.id, parentId: null, name: 'Skip', icon: '', description: '', sortOrder: 100 });
    await repo.createLink({ folderId: folder.id, name: 'Disabled', url: 'https://disabled.example/', icon: '', description: '', sortOrder: 100, healthCheckEnabled: false });
    await repo.createLink({ folderId: folder.id, name: 'Private', url: 'http://127.0.0.1:3000/', icon: '', description: '', sortOrder: 90 });
    const safeRequester = vi.fn();

    try {
      app = await buildApp({ repo, sessionSecret, encryptionKey, safeRequester: safeRequester as any });
      await app.ready();
      await vi.advanceTimersByTimeAsync(1000);
      expect(safeRequester).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects folder parent cycles', async () => {
    const cookie = await setupAdmin();
    const parent = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Parent' } });
    const child = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Child', parentId: parent.json().data.id } });

    const selfParent = await app.inject({
      method: 'PUT',
      url: `/api/admin/folders/${parent.json().data.id}`,
      headers: { cookie },
      payload: { parentId: parent.json().data.id },
    });
    expect(selfParent.statusCode).toBe(400);

    const descendantParent = await app.inject({
      method: 'PUT',
      url: `/api/admin/folders/${parent.json().data.id}`,
      headers: { cookie },
      payload: { parentId: child.json().data.id },
    });
    expect(descendantParent.statusCode).toBe(400);
  });

  it('does not allow folder updates to change server-owned fields', async () => {
    const adminCookie = await setupAdmin();
    const reader = await setupUser(adminCookie);
    const folder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie: adminCookie },
      payload: { name: 'Owned by admin' },
    });
    const folderId = folder.json().data.id;
    const originalCreatedAt = folder.json().data.createdAt;

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/admin/folders/${folderId}`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'Still owned by admin',
        userId: reader.userId,
        id: folderId + 1000,
        createdAt: '2000-01-01T00:00:00.000Z',
        passwordHash: 'attacker-controlled',
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({ id: folderId, userId: 1, name: 'Still owned by admin' });
    expect(updated.json().data.createdAt).toBe(originalCreatedAt);
    expect(updated.json().data.passwordHash).toBeNull();
    expect((await repo.listFolders(reader.userId)).some((item) => item.id === folderId)).toBe(false);
  });

  it('does not allow link updates to change server-owned fields', async () => {
    const cookie = await setupAdmin();
    const folder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie },
      payload: { name: 'Reading' },
    });
    const link = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie },
      payload: { folderId: folder.json().data.id, name: 'Original', url: 'https://original.example/' },
    });
    const linkId = link.json().data.id;
    const originalCreatedAt = link.json().data.createdAt;

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/admin/links/${linkId}`,
      headers: { cookie },
      payload: {
        name: 'Updated',
        url: 'https://updated.example/path',
        icon: 'bookmark',
        description: 'Allowed fields still update',
        sortOrder: 42,
        id: linkId + 1000,
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
        serverOnly: 'attacker-controlled',
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({
      id: linkId,
      folderId: folder.json().data.id,
      name: 'Updated',
      url: 'https://updated.example/path',
      icon: 'bookmark',
      description: 'Allowed fields still update',
      sortOrder: 42,
    });
    expect(updated.json().data.createdAt).toBe(originalCreatedAt);
    expect(updated.json().data).not.toHaveProperty('serverOnly');
  });

  it('does not allow link updates to move into another user folder', async () => {
    const adminCookie = await setupAdmin();
    const reader = await setupUser(adminCookie);
    const adminFolder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie: adminCookie },
      payload: { name: 'Admin folder' },
    });
    const readerFolder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie: reader.cookie },
      payload: { name: 'Reader folder' },
    });
    const link = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie: adminCookie },
      payload: { folderId: adminFolder.json().data.id, name: 'Admin link', url: 'https://admin.example/' },
    });

    const moved = await app.inject({
      method: 'PUT',
      url: `/api/admin/links/${link.json().data.id}`,
      headers: { cookie: adminCookie },
      payload: { folderId: readerFolder.json().data.id },
    });

    expect(moved.statusCode).toBe(404);
    expect(moved.json()).toMatchObject({ code: 404, message: 'Folder not found' });
    expect((await repo.listLinks(1))[0].folderId).toBe(adminFolder.json().data.id);
    expect(await repo.listLinks(reader.userId)).toHaveLength(0);
  });

  it('does not allow AI save to write into another user folder', async () => {
    const adminCookie = await setupAdmin();
    const reader = await setupUser(adminCookie);
    const folder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie: adminCookie },
      payload: { name: 'Admin only' },
    });

    const saved = await app.inject({
      method: 'POST',
      url: '/api/ai/save',
      headers: { cookie: reader.cookie },
      payload: {
        folderId: folder.json().data.id,
        url: 'https://cross-user.example/',
        title: 'Cross-user write',
      },
    });

    expect(saved.statusCode).toBe(404);
    expect(saved.json()).toMatchObject({ code: 404, message: 'Folder not found' });
    expect(await repo.listLinks(1)).toHaveLength(0);
    expect(await repo.listLinks(reader.userId)).toHaveLength(0);
  });

  it('falls back when LLM is not configured and saves the confirmed bookmark', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Reading' } });

    const analysis = await app.inject({
      method: 'POST',
      url: '/api/ai/analyze',
      headers: { cookie },
      payload: { url: 'https://example.com/article', title: 'Example Article', content: 'A concise summary' },
    });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().data).toMatchObject({
      suggestedName: 'Example Article',
      suggestedKeywords: [],
      createFolder: false,
    });

    const saved = await app.inject({
      method: 'POST',
      url: '/api/ai/save',
      headers: { cookie },
      payload: { url: 'https://example.com/article', title: 'Example Article', name: 'Example Article' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.url).toBe('https://example.com/article');
    expect(await repo.listLinks(1)).toHaveLength(1);
  });

  it('persists a custom LLM API base URL and passes it to bookmark analysis', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('{"suggestedName":"A complete long article title about dependable clipping","suggestedDescription":"Summary","suggestedKeywords":["AI","Reading"]}'),
    };
    await app.close();
    app = await buildApp({ repo, sessionSecret, encryptionKey, llmClient });
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Reading', description: '只收录深度阅读和长篇资料' } });

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/admin/account/llm',
      headers: { cookie },
      payload: {
        provider: 'openai',
        model: 'custom-model',
        apiKey: 'secret-key',
        baseUrl: 'https://gateway.example.com/v1/',
        reasoningEffort: 'high',
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({
      llmProvider: 'openai',
      llmModel: 'custom-model',
      llmBaseUrl: 'https://gateway.example.com/v1',
      llmReasoningEffort: 'high',
      hasLlmApiKey: true,
    });

    const analysis = await app.inject({
      method: 'POST',
      url: '/api/ai/analyze',
      headers: { cookie },
      payload: { url: 'https://example.com/article', title: 'Example', purpose: 'clip' },
    });

    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().data).toMatchObject({
      suggestedName: 'A complete long article title about dependable clipping',
      suggestedDescription: 'Summary',
      suggestedKeywords: ['AI', 'Reading'],
    });
    expect(llmClient.complete).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai',
      model: 'custom-model',
      baseUrl: 'https://gateway.example.com/v1',
      reasoningEffort: 'high',
      prompt: expect.stringContaining('只收录深度阅读和长篇资料'),
    }));
    expect(llmClient.complete.mock.calls[0][0].prompt).toContain('suggestedKeywords');
    expect(llmClient.complete.mock.calls[0][0].prompt).toContain('web clip');
  });

  it('tests an unsaved LLM connection with the selected reasoning depth', async () => {
    const llmClient = { complete: vi.fn().mockResolvedValue('{"ok":true}') };
    await app.close();
    app = await buildApp({ repo, sessionSecret, encryptionKey, llmClient });
    const cookie = await setupAdmin();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/account/llm/test',
      headers: { cookie },
      payload: {
        provider: 'openai',
        model: 'gpt-5-mini',
        apiKey: 'test-key',
        baseUrl: 'https://gateway.example.com/v1',
        reasoningEffort: 'medium',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ ok: true, model: 'gpt-5-mini', reasoningEffort: 'medium' });
    expect(llmClient.complete).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-key',
      reasoningEffort: 'medium',
      prompt: 'Return exactly this JSON: {"ok":true}',
    }));
  });

  it('resolves custom OpenAI-compatible and Claude API endpoints', async () => {
    const requester = vi.fn()
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: Buffer.from('{"choices":[{"message":{"content":"{}"}}]}'),
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: Buffer.from('{"content":[{"type":"text","text":"{}"}]}'),
      });
    const client = new FetchLlmClient(requester as any);

    await client.complete({
      provider: 'openai',
      apiKey: 'key',
      model: 'model',
      baseUrl: 'https://openrouter.example/api/v1',
      prompt: 'hello',
    });
    await client.complete({
      provider: 'claude',
      apiKey: 'key',
      model: 'model',
      baseUrl: 'https://claude-gateway.example/v1/',
      prompt: 'hello',
    });

    expect(requester.mock.calls[0][0]).toBe('https://openrouter.example/api/v1/chat/completions');
    expect(requester.mock.calls[1][0]).toBe('https://claude-gateway.example/v1/messages');
  });

  it('refuses to demote the last administrator', async () => {
    const cookie = await setupAdmin();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/users/1',
      headers: { cookie },
      payload: { role: 'user' },
    });

    expect(response.statusCode).toBe(409);
    expect((await repo.findUserById(1))?.role).toBe('admin');
  });

  it('does not reopen initial setup after initialization has completed', async () => {
    await setupAdmin();
    const initialized = await repo.findUserById(1);
    expect(initialized).not.toBeNull();
    if (initialized) initialized.role = 'user';

    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'replacement', email: 'replacement@nono.test', password: adminPassword },
    });
    const session = await app.inject({ method: 'GET', url: '/api/auth/session' });

    expect(setup.statusCode).toBe(409);
    expect(session.json().data.setupRequired).toBe(false);
  });
});
