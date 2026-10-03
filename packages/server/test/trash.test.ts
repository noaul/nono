import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { MemoryRepository, type TrashItemRecord } from '../src/services/repository.js';
import { createPrismaRepository } from '../src/services/prisma.repository.js';
import { runTrashRetentionPurge, trashRetentionConfig } from '../src/services/trash-retention.scheduler.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DAY = 24 * 60 * 60 * 1000;

let app: FastifyInstance;
let repo: MemoryRepository;

async function setupAdmin() {
  const response = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'admin@nono.test', password: 'Password2026!' } });
  return String(response.headers['set-cookie']).split(';', 1)[0];
}

function trashItem(userId: number, deletedAt: Date, label = 'item'): TrashItemRecord {
  return { id: randomUUID(), userId, kind: 'bookmark', entityId: 1, label, payload: { link: { secret: true } }, deletedAt };
}

describe('trash pagination', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('pages through the trash newest first with a cursor and no payloads', async () => {
    const cookie = await setupAdmin();
    const base = Date.parse('2026-09-01T00:00:00.000Z');
    // Two items share a timestamp so the cursor has to break ties.
    repo.trashItems = [0, 1, 2, 2, 3].map((offset, index) => trashItem(1, new Date(base + offset * 1000), `item-${index}`));

    const first = await app.inject({ method: 'GET', url: '/api/admin/trash?limit=2', headers: { cookie } });
    expect(first.statusCode).toBe(200);
    const page = first.json().data;
    expect(page.total).toBe(5);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toEqual({ id: expect.any(String), kind: 'bookmark', entityId: 1, label: 'item-4', deletedAt: expect.any(String) });
    expect(page.nextCursor).toEqual(expect.any(String));

    const seen = [...page.items];
    let cursor = page.nextCursor;
    while (cursor) {
      const next = (await app.inject({ method: 'GET', url: `/api/admin/trash?limit=2&cursor=${encodeURIComponent(cursor)}`, headers: { cookie } })).json().data;
      seen.push(...next.items);
      cursor = next.nextCursor;
    }
    expect(seen.map((item) => item.label).sort()).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
    expect(new Set(seen.map((item) => item.id)).size).toBe(5);
    expect(seen.map((item) => Date.parse(item.deletedAt))).toEqual([...seen.map((item) => Date.parse(item.deletedAt))].sort((a, b) => b - a));
  });

  it('defaults to 50 items per page and rejects a malformed cursor', async () => {
    const cookie = await setupAdmin();
    repo.trashItems = Array.from({ length: 55 }, (_, index) => trashItem(1, new Date(Date.now() - index * 1000)));

    const page = (await app.inject({ method: 'GET', url: '/api/admin/trash', headers: { cookie } })).json().data;
    expect(page.items).toHaveLength(50);
    expect(page.total).toBe(55);

    const bad = await app.inject({ method: 'GET', url: '/api/admin/trash?cursor=not-a-cursor', headers: { cookie } });
    expect(bad.statusCode).toBe(400);
    const tooBig = await app.inject({ method: 'GET', url: '/api/admin/trash?limit=100000', headers: { cookie } });
    expect(tooBig.statusCode).toBe(400);
  });

  it('pages with a keyset query in Prisma without selecting payloads', async () => {
    const rows = [
      { id: 'c', userId: 7, kind: 'bookmark', entityId: 1, label: 'C', deletedAt: new Date('2026-09-03T00:00:00.000Z') },
      { id: 'b', userId: 7, kind: 'bookmark', entityId: 1, label: 'B', deletedAt: new Date('2026-09-02T00:00:00.000Z') },
      { id: 'a', userId: 7, kind: 'bookmark', entityId: 1, label: 'A', deletedAt: new Date('2026-09-01T00:00:00.000Z') },
    ];
    const prisma = { trashItem: { findMany: vi.fn().mockResolvedValue(rows), count: vi.fn().mockResolvedValue(9) } };
    const prismaRepo = createPrismaRepository(prisma as never);

    const page = await prismaRepo.listTrashItems(7, { limit: 2 });
    expect(page).toMatchObject({ total: 9, items: [{ id: 'c' }, { id: 'b' }] });
    const query = prisma.trashItem.findMany.mock.calls[0][0];
    expect(query).toMatchObject({ where: { userId: 7 }, take: 3, orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }] });
    expect(query.select.payload).toBeUndefined();

    await prismaRepo.listTrashItems(7, { limit: 2, cursor: page.nextCursor });
    expect(prisma.trashItem.findMany.mock.calls[1][0].where).toEqual({
      userId: 7,
      OR: [
        { deletedAt: { lt: rows[1].deletedAt } },
        { deletedAt: rows[1].deletedAt, id: { lt: 'b' } },
      ],
    });
  });
});

describe('trash retention', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('purges items older than the retention window for every user', async () => {
    const memory = new MemoryRepository(false);
    const now = new Date('2026-10-01T00:00:00.000Z');
    const keep = trashItem(1, new Date(now.getTime() - 29 * DAY), 'keep');
    const edge = trashItem(2, new Date(now.getTime() - 30 * DAY + 1000), 'edge');
    memory.trashItems = [
      trashItem(1, new Date(now.getTime() - 31 * DAY), 'old-1'),
      keep,
      trashItem(2, new Date(now.getTime() - 400 * DAY), 'old-2'),
      edge,
    ];

    await expect(runTrashRetentionPurge(memory, 30, now)).resolves.toEqual({ purged: 2 });
    expect(memory.trashItems.map((item) => item.label).sort()).toEqual(['edge', 'keep']);
  });

  it('purges with one bounded deleteMany in Prisma', async () => {
    const prisma = { trashItem: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) } };
    const cutoff = new Date('2026-09-01T00:00:00.000Z');
    await expect(createPrismaRepository(prisma as never).purgeTrashBefore(cutoff)).resolves.toBe(3);
    expect(prisma.trashItem.deleteMany).toHaveBeenCalledWith({ where: { deletedAt: { lt: cutoff } } });
  });

  it('reads bounded retention settings from the environment', () => {
    expect(trashRetentionConfig({ NODE_ENV: 'production' })).toEqual({ enabled: true, retentionDays: 30, intervalMs: 6 * 60 * 60 * 1000, startDelayMs: 60_000 });
    expect(trashRetentionConfig({ NODE_ENV: 'test' }).enabled).toBe(false);
    expect(trashRetentionConfig({ TRASH_PURGE_ENABLED: 'false', NODE_ENV: 'production' }).enabled).toBe(false);
    expect(trashRetentionConfig({ TRASH_RETENTION_DAYS: '0', TRASH_PURGE_INTERVAL_HOURS: '0' })).toMatchObject({ retentionDays: 1, intervalMs: 60 * 60 * 1000 });
    expect(trashRetentionConfig({ TRASH_RETENTION_DAYS: '99999', TRASH_PURGE_INTERVAL_HOURS: '99999' })).toMatchObject({ retentionDays: 3650, intervalMs: 7 * 24 * 60 * 60 * 1000 });
    expect(trashRetentionConfig({ TRASH_RETENTION_DAYS: 'soon' }).retentionDays).toBe(30);
  });

  it('runs the purge on a timer once the app is ready', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
    vi.stubEnv('TRASH_PURGE_ENABLED', 'true');
    vi.stubEnv('TRASH_RETENTION_DAYS', '7');
    vi.stubEnv('TRASH_PURGE_START_DELAY_SECONDS', '1');
    const memory = new MemoryRepository(false);
    memory.trashItems = [trashItem(1, new Date(Date.now() - 8 * DAY), 'old'), trashItem(1, new Date(Date.now() - DAY), 'new')];
    const scheduled = await buildApp({ repo: memory, sessionSecret, encryptionKey });
    try {
      await scheduled.ready();
      expect(memory.trashItems).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(memory.trashItems.map((item) => item.label)).toEqual(['new']);
    } finally {
      await scheduled.close();
    }
  });
});
