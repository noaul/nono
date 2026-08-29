import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { createNotificationService } from '../src/services/notification.service.js';

const sessionSecret = 'notification-test-session-secret';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'Password2026!';

function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }) {
  const value = response.headers['set-cookie'];
  return (Array.isArray(value) ? value[0] : String(value)).split(';', 1)[0];
}

describe('notification routes', () => {
  let app: FastifyInstance;
  let cookie: string;
  let repo: MemoryRepository;
  let notificationService: {
    list: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    markAllRead: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
  let noMoneyClient: {
    renewVps: ReturnType<typeof vi.fn>;
    undoVpsRenewal: ReturnType<typeof vi.fn>;
    updateVpsRenewalExpense: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    notificationService = {
      list: vi.fn(async () => ({ items: [], unreadCount: 0, generatedAt: '2026-07-18T08:00:00.000Z' })),
      markRead: vi.fn(async () => undefined),
      markAllRead: vi.fn(async () => 2),
      dismiss: vi.fn(async () => undefined),
    };
    noMoneyClient = {
      renewVps: vi.fn(async () => ({
        idempotent: false,
        item: { id: 10, expireDate: '2027-08-10' },
        renewal: { id: 41, renewedExpireDate: '2027-08-10', amountMinorUnits: 1200, currency: 'USD' },
      })),
      undoVpsRenewal: vi.fn(async () => ({ item: { id: 10, expireDate: '2026-08-10' } })),
      updateVpsRenewalExpense: vi.fn(async () => ({ renewal: { id: 41, amountMinorUnits: 1400, currency: 'USD' } })),
    };
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey, notificationService, noMoneyClient } as any);
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@notifications.test', displayName: 'Admin', password },
    });
    cookie = sessionCookie(setup);
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/notifications' });
    expect(response.statusCode).toBe(401);
    expect(notificationService.list).not.toHaveBeenCalled();
  });

  it('does not expose private NoDesk notifications to a bearer token', async () => {
    await app.close();
    const actualNotificationService = createNotificationService({
      prisma: {
        notificationState: { findMany: async () => [] },
      } as never,
      nodeskReader: async () => ({
        calendarEvents: [{ id: 'private', date: '2026-08-29', time: '09:00', title: 'Private review', note: 'Secret note' }],
      }),
      noMoneyReader: async () => [],
      backupService: { list: async () => [] },
      now: () => new Date('2026-08-29T08:00:00.000Z'),
      timeZone: 'UTC',
    });
    app = await buildApp({ repo, sessionSecret, encryptionKey, notificationService: actualNotificationService } as any);
    const token = (await repo.createToken(1, 'automation', null, ['*'])).token;

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/notifications?sources=nodesk',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('Private review');
    expect(response.body).not.toContain('Secret note');
  });

  it('does not let bearer tokens mutate notification state', async () => {
    const token = (await repo.createToken(1, 'automation', null, ['*'])).token;
    const headers = { authorization: `Bearer ${token}` };

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/admin/notifications/mark-all-read', headers }),
      app.inject({ method: 'PUT', url: '/api/admin/notifications/nostar%3Aabc/read', headers, payload: { read: true } }),
      app.inject({ method: 'DELETE', url: '/api/admin/notifications/links%3Aabc', headers }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403]);
    expect(notificationService.markAllRead).not.toHaveBeenCalled();
    expect(notificationService.markRead).not.toHaveBeenCalled();
    expect(notificationService.dismiss).not.toHaveBeenCalled();
  });

  it('returns the authenticated user feed with a bounded limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/notifications?limit=5',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    // The route negotiates a locale per request so server-rendered notification text matches the UI.
    expect(notificationService.list).toHaveBeenCalledWith(expect.objectContaining({ id: 1, role: 'admin' }), { limit: 5, locale: 'zh' });
    expect(response.json().data).toMatchObject({ unreadCount: 0, items: [] });
  });

  it('passes validated source filters to list and mark-all operations', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/notifications?limit=100&sources=nodesk%2Cnomoney%2Cyumi',
      headers: { cookie },
    });
    const markAll = await app.inject({
      method: 'POST',
      url: '/api/admin/notifications/mark-all-read?sources=nodesk%2Cnomoney%2Cyumi',
      headers: { cookie },
    });

    expect(list.statusCode).toBe(200);
    expect(markAll.statusCode).toBe(200);
    expect(notificationService.list).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), {
      limit: 100,
      locale: 'zh',
      sources: ['nodesk', 'nomoney', 'yumi'],
    });
    expect(notificationService.markAllRead).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), {
      sources: ['nodesk', 'nomoney', 'yumi'],
    });
  });

  it('marks one or all current notifications as read', async () => {
    const one = await app.inject({
      method: 'PUT',
      url: '/api/admin/notifications/nostar%3Aabc/read',
      headers: { cookie },
      payload: { read: true },
    });
    const all = await app.inject({
      method: 'POST',
      url: '/api/admin/notifications/mark-all-read',
      headers: { cookie },
    });

    expect(one.statusCode).toBe(200);
    expect(all.statusCode).toBe(200);
    expect(notificationService.markRead).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'nostar:abc', true);
    expect(notificationService.markAllRead).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(all.json().data.updated).toBe(2);
  });

  it('dismisses a current notification', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/notifications/links%3Aabc',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(notificationService.dismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'links:abc');
  });

  it('proxies authenticated VPS renewal, undo, and expense correction to Yumi', async () => {
    const renew = await app.inject({
      method: 'POST',
      url: '/api/admin/yumi/vps/10/renew',
      headers: { cookie },
      payload: { requestId: 'nono-renew-2026', expectedExpireDate: '2026-08-10' },
    });
    const undo = await app.inject({
      method: 'POST',
      url: '/api/admin/yumi/vps/10/renewals/41/undo',
      headers: { cookie },
    });
    const amount = await app.inject({
      method: 'PUT',
      url: '/api/admin/yumi/vps/10/renewals/41/expense',
      headers: { cookie },
      payload: { amountMinorUnits: 1400 },
    });

    expect(renew.statusCode).toBe(200);
    expect(undo.statusCode).toBe(200);
    expect(amount.statusCode).toBe(200);
    expect(noMoneyClient.renewVps).toHaveBeenCalledWith(10, {
      requestId: 'nono-renew-2026',
      expectedExpireDate: '2026-08-10',
    });
    expect(noMoneyClient.undoVpsRenewal).toHaveBeenCalledWith(10, 41);
    expect(noMoneyClient.updateVpsRenewalExpense).toHaveBeenCalledWith(10, 41, 1400);
  });
});
