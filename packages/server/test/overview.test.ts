import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('GET /api/admin/overview', () => {
  let app: FastifyInstance;
  afterEach(async () => { await app?.close(); });

  async function start() {
    const repo = new MemoryRepository(false);
    const productOverviewReader = vi.fn(async (product: 'nomoney' | 'yumi') => {
      if (product === 'yumi') throw new Error('Yumi overview is unavailable');
      return { product, due: { buckets: { overdue: 1, today: 0, week: 2, month: 0 }, next: [] } };
    });
    app = await buildApp({
      repo,
      sessionSecret,
      encryptionKey,
      prisma: { noStarRelease: { count: vi.fn(async () => 4) } } as any,
      notificationService: { list: vi.fn(async () => ({ items: [], unreadCount: 7, urgentUnreadCount: 2, generatedAt: '' })) } as any,
      backupAutomationService: { get: vi.fn(async () => ({ settings: { enabled: true }, status: { lastSuccessAt: '2026-10-01T03:00:00.000Z', lastFailureAt: null, lastError: null } })) } as any,
      productOverviewReader,
    });
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'admin@nono.test', password: 'Password2026!' } });
    const cookie = String(setup.headers['set-cookie']).split(';', 1)[0];
    return { repo, cookie, productOverviewReader };
  }

  it('gathers every product and isolates a failing one', async () => {
    const { repo, cookie } = await start();
    const folder = await repo.createFolder({ userId: 1, name: 'F', sortOrder: 1 } as any);
    await repo.createLink({ folderId: folder.id, name: 'Dead', url: 'https://dead.test/', sortOrder: 1, healthStatus: 'broken' } as any);
    await repo.createLink({ folderId: folder.id, name: 'Muted', url: 'https://muted.test/', sortOrder: 2, healthStatus: 'broken', healthCheckEnabled: false } as any);
    await repo.createLink({ folderId: folder.id, name: 'Fine', url: 'https://ok.test/', sortOrder: 3, healthStatus: 'ok' } as any);

    const response = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.notifications).toEqual({ state: 'ok', data: { unread: 7, urgent: 2 } });
    expect(data.links).toEqual({ state: 'ok', data: { total: 3, broken: 1, examples: [{ id: expect.any(Number), name: 'Dead', url: 'https://dead.test/' }] } });
    expect(data.nostar).toEqual({ state: 'ok', data: { unreadReleases: 4 } });
    expect(data.backup).toMatchObject({ state: 'ok', data: { enabled: true, lastSuccessAt: '2026-10-01T03:00:00.000Z' } });
    expect(data.nomoney).toMatchObject({ state: 'ok', data: { product: 'nomoney', due: { buckets: { overdue: 1 } } } });
    expect(data.yumi).toEqual({ state: 'unavailable', error: 'Yumi overview is unavailable' });
  });

  it('is limited to administrators with a browser session', async () => {
    const { repo, cookie } = await start();
    expect((await app.inject({ method: 'GET', url: '/api/admin/overview' })).statusCode).toBe(401);

    await repo.updateConfig({ allowRegistration: true } as any);
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'reader', email: 'r@nono.test', password: 'Reader2026!' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'reader', password: 'Reader2026!' } });
    const readerCookie = String(login.headers['set-cookie']).split(';', 1)[0];
    expect((await app.inject({ method: 'GET', url: '/api/admin/overview', headers: { cookie: readerCookie } })).statusCode).toBe(403);

    const created = await app.inject({ method: 'POST', url: '/api/admin/tokens', headers: { cookie }, payload: { name: 'cli', scopes: ['*'] } });
    const bearer = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: { authorization: `Bearer ${created.json().data.token}` } });
    expect(bearer.statusCode).toBe(403);
  });
});
