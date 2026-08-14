import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNoMoneyDueReader, createNotificationService, createYumiDueReader } from '../src/services/notification.service.js';

const now = new Date('2026-07-18T08:00:00.000Z');

function createPrisma(options: {
  links?: any[];
  releases?: any[];
  states?: any[];
} = {}) {
  const queries = { links: [] as any[], releases: [] as any[], states: [] as any[], upserts: [] as any[] };
  const prisma = {
    link: {
      findMany: vi.fn(async (query: any) => {
        queries.links.push(query);
        return options.links || [];
      }),
    },
    noStarRelease: {
      findMany: vi.fn(async (query: any) => {
        queries.releases.push(query);
        return options.releases || [];
      }),
    },
    notificationState: {
      findMany: vi.fn(async (query: any) => {
        queries.states.push(query);
        return options.states || [];
      }),
      upsert: vi.fn(async (query: any) => {
        queries.upserts.push(query);
        return query.create;
      }),
    },
  };
  return { prisma: prisma as any, queries };
}

function createService(overrides: Record<string, unknown> = {}) {
  const { prisma, queries } = createPrisma(overrides as any);
  const nodeskReader = vi.fn(async () => ({ calendarEvents: [] }));
  const noMoneyReader = vi.fn(async () => []);
  const backupService = { list: vi.fn(async () => []) };
  const service = createNotificationService({
    prisma,
    nodeskReader,
    noMoneyReader,
    backupService: backupService as any,
    now: () => now,
    ...overrides,
  } as any);
  return { service, queries, nodeskReader, noMoneyReader, backupService };
}

describe('notification service', () => {
  it('reads only the expected NoMoney tables through a read-only sqlite command', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-notification-nomoney-'));
    const databasePath = path.join(directory, 'app.db');
    fs.writeFileSync(databasePath, 'sqlite-placeholder');
    const run = vi.fn(async () => ({
      stdout: JSON.stringify([{ asset_type: 'subscription', id: 3, name: 'Claude', due_date: '2026-07-20', status: 'active' }]),
      stderr: '',
    }));
    try {
      const items = await createNoMoneyDueReader(directory, run)();
      expect(run).toHaveBeenCalledWith('sqlite3', [
        '-readonly',
        '-json',
        databasePath,
        expect.stringContaining("SELECT 'phone' AS asset_type"),
      ]);
      expect(items).toEqual([{ assetType: 'subscription', id: 3, name: 'Claude', dueDate: '2026-07-20', status: 'active' }]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reads VPS and domains from the independent Yumi database', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-notification-yumi-'));
    const databasePath = path.join(directory, 'app.db');
    fs.writeFileSync(databasePath, 'sqlite-placeholder');
    const run = vi.fn(async () => ({ stdout: JSON.stringify([{ asset_type: 'vps', id: 10, name: 'nc48', due_date: '2026-08-10', status: 'active' }]), stderr: '' }));
    try {
      await expect(createYumiDueReader(directory, run)()).resolves.toEqual([{ assetType: 'vps', id: 10, name: 'nc48', dueDate: '2026-08-10', status: 'active' }]);
      expect(run).toHaveBeenCalledWith('sqlite3', ['-readonly', '-json', databasePath, expect.stringContaining("SELECT 'domain' AS asset_type")]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('scopes personal sources and state to the authenticated user', async () => {
    const link = {
      id: 31,
      name: 'Broken link',
      url: 'https://broken.example',
      healthStatus: 'broken',
      healthStatusCode: 503,
      healthReason: 'HTTP 503',
      healthFinalUrl: null,
      healthCheckedAt: now,
      folder: { name: 'Work' },
    };
    const release = {
      githubId: BigInt(991),
      repoFullName: 'owner/tool',
      tagName: 'v2.0.0',
      name: 'Stable release',
      htmlUrl: 'https://github.com/owner/tool/releases/tag/v2.0.0',
      publishedAt: now,
      createdAt: now,
    };
    const { prisma, queries } = createPrisma({ links: [link], releases: [release] });
    const nodeskReader = vi.fn();
    const noMoneyReader = vi.fn();
    const backupService = { list: vi.fn() };
    const service = createNotificationService({ prisma, nodeskReader, noMoneyReader, backupService: backupService as any, now: () => now } as any);

    const feed = await service.list({ id: 7, role: 'user' } as any);

    expect(queries.links[0].where).toMatchObject({ folder: { userId: 7 } });
    expect(queries.links[0].where).toMatchObject({ healthCheckEnabled: true });
    expect(queries.releases[0].where).toEqual({ userId: 7, isRead: false });
    expect(queries.states[0].where.userId).toBe(7);
    expect(feed.items.map((item) => item.source)).toEqual(expect.arrayContaining(['links', 'nostar']));
    expect(feed.items.find((item) => item.source === 'links')).toMatchObject({
      entityId: 31,
      targetUrl: 'https://broken.example',
    });
    expect(nodeskReader).not.toHaveBeenCalled();
    expect(noMoneyReader).not.toHaveBeenCalled();
    expect(backupService.list).not.toHaveBeenCalled();
  });

  it('suppresses stale health alerts for local and private bookmarks', async () => {
    const { prisma } = createPrisma({
      links: [{
        id: 42,
        name: 'Local printer',
        url: 'http://192.168.223.1/',
        healthStatus: 'broken',
        healthStatusCode: null,
        healthReason: 'Target address is not public',
        healthFinalUrl: null,
        healthCheckedAt: now,
        folder: { name: 'Local' },
      }],
    });
    const service = createNotificationService({
      prisma,
      nodeskReader: vi.fn(),
      noMoneyReader: vi.fn(),
      backupService: { list: vi.fn() } as any,
      now: () => now,
    } as any);

    const feed = await service.list({ id: 7, role: 'user' } as any);

    expect(feed.items).toEqual([]);
  });

  it('does not create notifications for redirected bookmarks', async () => {
    const { prisma, queries } = createPrisma({
      links: [{
        id: 43,
        name: 'Moved docs',
        url: 'https://docs.example/',
        healthStatus: 'redirected',
        healthStatusCode: 200,
        healthReason: null,
        healthFinalUrl: 'https://www.example.com/docs',
        healthCheckedAt: now,
        folder: { name: 'Docs' },
      }],
    });
    const service = createNotificationService({
      prisma,
      nodeskReader: vi.fn(),
      noMoneyReader: vi.fn(),
      backupService: { list: vi.fn() } as any,
      now: () => now,
    } as any);

    const feed = await service.list({ id: 7, role: 'user' } as any);

    expect(queries.links[0].where.healthStatus.in).not.toContain('redirected');
    expect(feed.items).toEqual([]);
  });

  it('aggregates administrator schedules, expiring assets and stale backups', async () => {
    const { prisma } = createPrisma();
    const nodeskReader = vi.fn(async () => ({
      calendarEvents: [
        { id: 'today', date: '2026-07-18', time: '18:30', title: 'Publish notes', note: 'Final review' },
        { id: 'soon', date: '2026-07-21', title: 'Renew certificate' },
        { id: 'later', date: '2026-07-22', title: 'Outside window' },
      ],
    }));
    const noMoneyReader = vi.fn(async () => [
      { assetType: 'subscription', id: 9, name: 'Claude', dueDate: '2026-07-20', status: 'active' },
    ]);
    const yumiReader = vi.fn(async () => [{ assetType: 'vps', id: 10, name: 'nc48', dueDate: '2026-07-21', status: 'active' }]);
    const backupService = {
      list: vi.fn(async () => [{ id: 'old', createdAt: '2026-07-12T08:00:00.000Z' }]),
    };
    const service = createNotificationService({ prisma, nodeskReader, noMoneyReader, yumiReader, backupService: backupService as any, now: () => now } as any);

    const feed = await service.list({ id: 1, role: 'admin' } as any);

    expect(feed.items.filter((item) => item.source === 'nodesk').map((item) => item.title)).toEqual(['Publish notes', 'Renew certificate']);
    expect(feed.items.filter((item) => item.source === 'nomoney')).toHaveLength(1);
    expect(feed.items.filter((item) => item.source === 'yumi')).toHaveLength(1);
    expect(feed.items.find((item) => item.source === 'backup')).toMatchObject({ severity: 'warning', href: '/nodesk/?settings=backups' });
  });

  it('exposes VPS identity and due date for the quick renewal action', async () => {
    const { prisma } = createPrisma();
    const service = createNotificationService({
      prisma,
      nodeskReader: vi.fn(async () => ({ calendarEvents: [] })),
      noMoneyReader: vi.fn(async () => []),
      yumiReader: vi.fn(async () => [
        { assetType: 'vps', id: 10, name: 'nc48', dueDate: '2026-08-10', status: 'active' },
      ]),
      backupService: { list: vi.fn(async () => []) } as any,
      now: () => now,
    } as any);

    const feed = await service.list({ id: 1, role: 'admin' } as any);

    expect(feed.items.find((item) => item.source === 'yumi')).toMatchObject({
      entityId: 10,
      entityType: 'vps',
      entityLabel: 'nc48',
      renewalDate: '2026-08-10',
    });
  });

  it('filters the feed and mark-all operation to requested sources', async () => {
    const { prisma, queries } = createPrisma({
      links: [{
        id: 31,
        name: 'Broken link',
        url: 'https://broken.example',
        healthStatus: 'broken',
        healthStatusCode: 503,
        healthReason: 'HTTP 503',
        healthFinalUrl: null,
        healthCheckedAt: now,
        folder: { name: 'Work' },
      }],
    });
    const service = createNotificationService({
      prisma,
      nodeskReader: vi.fn(async () => ({
        calendarEvents: [{ id: 'today', date: '2026-07-18', time: '18:30', title: 'Publish notes' }],
      })),
      noMoneyReader: vi.fn(async () => [
        { assetType: 'domain', id: 9, name: 'noaul.com', dueDate: '2026-07-20', status: 'active' },
      ]),
      backupService: { list: vi.fn(async () => []) } as any,
      now: () => now,
    } as any);
    const user = { id: 1, role: 'admin' } as any;

    const feed = await service.list(user, { limit: 1, sources: ['nodesk', 'nomoney'] });
    const updated = await service.markAllRead(user, { sources: ['nodesk', 'nomoney'] });

    expect(feed.items.map((item) => item.source)).toEqual(['nodesk']);
    expect(feed.unreadCount).toBe(2);
    expect(feed.urgentUnreadCount).toBe(2);
    expect(updated).toBe(2);
    expect(queries.upserts).toHaveLength(2);
    expect(queries.upserts.every((query) => query.create.key.startsWith('nodesk:') || query.create.key.startsWith('nomoney:'))).toBe(true);
    expect(queries.links).toHaveLength(0);
    expect(queries.releases).toHaveLength(0);
  });

  it('reports the latest automatic backup failure to administrators', async () => {
    const { prisma } = createPrisma();
    const backupAutomationService = {
      get: vi.fn(async () => ({
        settings: { enabled: true, cadence: 'daily', hour: 3, weekday: 0, retentionDays: 30, maxBackups: 14 },
        status: {
          lastScheduledFor: 'daily:2026-07-18@03',
          lastStartedAt: '2026-07-18T03:00:00.000Z',
          lastCompletedAt: '2026-07-18T03:00:05.000Z',
          lastSuccessAt: '2026-07-17T03:00:05.000Z',
          lastFailureAt: '2026-07-18T03:00:05.000Z',
          lastError: 'pg_dump failed',
        },
      })),
    };
    const service = createNotificationService({
      prisma,
      nodeskReader: vi.fn(async () => ({ calendarEvents: [] })),
      noMoneyReader: vi.fn(async () => []),
      backupService: { list: vi.fn(async () => [{ id: 'recent', createdAt: '2026-07-17T08:00:00.000Z' }]) } as any,
      backupAutomationService: backupAutomationService as any,
      now: () => now,
    } as any);

    const feed = await service.list({ id: 1, role: 'admin' } as any);

    expect(feed.items.find((item) => item.title === '自动备份失败')).toMatchObject({
      source: 'backup',
      severity: 'critical',
      description: 'pg_dump failed',
      href: '/nodesk/?settings=backups',
    });
  });

  it('uses the configured weekly cadence when deciding whether a backup is stale', async () => {
    const { prisma } = createPrisma();
    const service = createNotificationService({
      prisma,
      nodeskReader: vi.fn(async () => ({ calendarEvents: [] })),
      noMoneyReader: vi.fn(async () => []),
      backupService: { list: vi.fn(async () => [{ id: 'weekly', createdAt: '2026-07-13T08:00:00.000Z' }]) } as any,
      backupAutomationService: {
        get: vi.fn(async () => ({
          settings: { enabled: true, cadence: 'weekly', hour: 3, weekday: 1, retentionDays: 30, maxBackups: 14 },
          status: { lastSuccessAt: '2026-07-13T08:00:00.000Z', lastFailureAt: null, lastError: null },
        })),
      } as any,
      now: () => now,
    } as any);

    const feed = await service.list({ id: 1, role: 'admin' } as any);
    expect(feed.items.filter((item) => item.source === 'backup')).toEqual([]);
  });

  it('applies per-user read and dismissed state', async () => {
    const checkedAt = new Date('2026-07-18T07:00:00.000Z');
    const first = createService({
      links: [{
        id: 8,
        name: 'Timeout link',
        url: 'https://slow.example',
        healthStatus: 'timeout',
        healthStatusCode: null,
        healthReason: 'Timed out',
        healthFinalUrl: null,
        healthCheckedAt: checkedAt,
        folder: { name: 'Tools' },
      }],
    });
    const initial = await first.service.list({ id: 5, role: 'user' } as any);
    const key = initial.items[0].key;

    const { prisma } = createPrisma({ states: [{ key, readAt: now, dismissedAt: null }] });
    const readService = createNotificationService({
      prisma,
      nodeskReader: vi.fn(),
      noMoneyReader: vi.fn(),
      backupService: { list: vi.fn() } as any,
      now: () => now,
    } as any);
    (prisma.link.findMany as any).mockResolvedValueOnce([{
      id: 8,
      name: 'Timeout link',
      url: 'https://slow.example',
      healthStatus: 'timeout',
      healthStatusCode: null,
      healthReason: 'Timed out',
      healthFinalUrl: null,
      healthCheckedAt: checkedAt,
      folder: { name: 'Tools' },
    }]);
    const readFeed = await readService.list({ id: 5, role: 'user' } as any);
    expect(readFeed.items[0].read).toBe(true);
    expect(readFeed.unreadCount).toBe(0);

    (prisma.notificationState.findMany as any).mockResolvedValueOnce([{ key, readAt: now, dismissedAt: now }]);
    const dismissedFeed = await readService.list({ id: 5, role: 'user' } as any);
    expect(dismissedFeed.items).toHaveLength(0);
  });

  it('marks only a current notification for the current user', async () => {
    const serviceSetup = createService({
      releases: [{
        githubId: BigInt(77),
        repoFullName: 'owner/tool',
        tagName: 'v1',
        name: null,
        htmlUrl: null,
        publishedAt: now,
        createdAt: now,
      }],
    });
    const feed = await serviceSetup.service.list({ id: 4, role: 'user' } as any);

    await serviceSetup.service.markRead({ id: 4, role: 'user' } as any, feed.items[0].key, true);

    expect(serviceSetup.queries.upserts[0]).toMatchObject({
      where: { userId_key: { userId: 4, key: feed.items[0].key } },
      update: { readAt: now },
      create: { userId: 4, key: feed.items[0].key, readAt: now },
    });
    await expect(serviceSetup.service.markRead({ id: 4, role: 'user' } as any, 'links:not-current', true)).rejects.toMatchObject({ statusCode: 404 });
  });
});
