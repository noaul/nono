import { describe, expect, it, vi } from 'vitest';
import { createPrismaRepository } from '../src/services/prisma.repository.js';

describe('Prisma repository batch deletion', () => {
	it('increments bookmark usage without allowing cross-user writes', async () => {
		const prisma = {
			link: {
				updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
		};
		const repo = createPrismaRepository(prisma as never);

		await expect(repo.recordLinkClick(7, 21)).resolves.toBe(true);
		expect(prisma.link.updateMany).toHaveBeenCalledWith({
			where: { id: 21, folder: { userId: 7 } },
			data: { clickCount: { increment: 1 }, lastClickedAt: expect.any(Date) },
		});
	});

  it('serializes first-admin initialization with a PostgreSQL transaction lock', async () => {
    const events: string[] = [];
    const created = { id: 1, username: 'owner', role: 'admin' };
    const transaction = {
      $queryRawUnsafe: vi.fn().mockImplementation(async () => events.push('lock')),
      user: {
        findMany: vi.fn().mockImplementation(async () => {
          events.push('read');
          return [];
        }),
        create: vi.fn().mockImplementation(async () => {
          events.push('create');
          return created;
        }),
      },
      appConfig: {
        upsert: vi.fn().mockResolvedValue({ id: 1, initializedAt: null }),
        update: vi.fn().mockImplementation(async () => events.push('mark-initialized')),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
    };
    const repo = createPrismaRepository(prisma as never);

    await expect(repo.initializeAdmin({
      username: 'owner',
      email: 'owner@nono.test',
      displayName: 'Owner',
      passwordHash: 'hash',
      role: 'admin',
    })).resolves.toBe(created);

    expect(events).toEqual(['lock', 'read', 'create', 'mark-initialized']);
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(1313820239)');
    expect(transaction.appConfig.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { initializedAt: expect.any(Date) } });
  });

  it('does not delete the last administrator inside the identity transaction lock', async () => {
    const transaction = {
      $queryRawUnsafe: vi.fn(),
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 7, role: 'admin' }),
        count: vi.fn().mockResolvedValue(1),
        delete: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
    };
    const repo = createPrismaRepository(prisma as never);

    await expect(repo.deleteUser(7)).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(1313820239)');
    expect(transaction.user.delete).not.toHaveBeenCalled();
  });

  it('does not delete the last administrator from the in-memory repository', async () => {
    const { MemoryRepository } = await import('../src/services/repository.js');
    const memory = new MemoryRepository(false);
    await memory.initializeAdmin({
      username: 'owner',
      email: 'owner@nono.test',
      displayName: 'Owner',
      passwordHash: 'hash',
      role: 'admin',
    });

    await expect(memory.deleteUser(1)).rejects.toMatchObject({ statusCode: 409 });
    expect((await memory.findUserById(1))?.role).toBe('admin');
  });

  it('treats a folder already removed by cascade as deleted', async () => {
    const transaction = {
      folder: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      link: { findMany: vi.fn().mockResolvedValue([]) },
      trashItem: { create: vi.fn() },
    };
    const prisma = { ...transaction, $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)) };
    const repo = createPrismaRepository(prisma as never);

    await expect(repo.deleteFolder(1, 168)).resolves.toBeUndefined();
    expect(transaction.folder.findMany).toHaveBeenCalledWith({ where: { userId: 1 } });
    expect(transaction.trashItem.create).not.toHaveBeenCalled();
    expect(transaction.folder.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes selected folder roots within the current user', async () => {
    const transaction = {
      folder: {
        findMany: vi.fn().mockResolvedValue([
          { id: 12, userId: 7, parentId: null, name: 'One' },
          { id: 18, userId: 7, parentId: null, name: 'Two' },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      link: { findMany: vi.fn().mockResolvedValue([]) },
      trashItem: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = { ...transaction, $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)) };
    const repo = createPrismaRepository(prisma as never);

    await repo.deleteFolders(7, [12, 18]);

    expect(transaction.trashItem.create).toHaveBeenCalledTimes(2);
    expect(transaction.folder.deleteMany).toHaveBeenCalledWith({ where: { userId: 7, id: { in: [12, 18] } } });
  });

  it('deletes selected links only when their folder belongs to the current user', async () => {
    const transaction = {
      link: {
        findMany: vi.fn().mockResolvedValue([
          { id: 21, folderId: 5, name: 'One' },
          { id: 34, folderId: 5, name: 'Two' },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      trashItem: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      // Deleting a bookmark detaches its clip, so the snapshot records the association first.
      clip: { findMany: vi.fn().mockResolvedValue([{ id: 11, linkId: 21 }]) },
    };
    const prisma = { ...transaction, $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)) };
    const repo = createPrismaRepository(prisma as never);

    await repo.deleteLinks(7, [21, 34]);

    expect(transaction.clip.findMany).toHaveBeenCalledWith({
      where: { userId: 7, linkId: { in: [21, 34] } },
      select: { id: true, linkId: true },
    });

    expect(transaction.link.findMany).toHaveBeenCalledWith({ where: { id: { in: [21, 34] }, folder: { userId: 7 } } });
    // 一次 createMany 承载全部回收站记录，而不是每条链接一次 create。
    expect(transaction.trashItem.createMany).toHaveBeenCalledTimes(1);
    expect(transaction.trashItem.createMany.mock.calls[0][0].data).toMatchObject([
      { userId: 7, kind: 'bookmark', entityId: 21, label: 'One' },
      { userId: 7, kind: 'bookmark', entityId: 34, label: 'Two' },
    ]);
    expect(transaction.link.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [21, 34] } } });
  });
});

/**
 * Restoring used to branch on `bookmark` and treat everything else as a folder, so a Clipper trash
 * item would have been fed to the folder restore path. These cover the explicit branches.
 */
describe('Clipper trash restore', () => {
  const OWNER = 7;

  function trashFixture(overrides: Record<string, any> = {}) {
    const clipPayload = {
      version: 1,
      clip: {
        id: 11,
        userId: OWNER,
        url: 'https://example.com/a',
        canonicalUrl: 'https://example.com/a',
        title: 'Kept',
        domain: 'example.com',
        excerpt: 'kept',
        contentHtml: '<p>kept</p>',
        contentMd: 'kept',
        contentHash: 'hash',
        contentVersion: 2,
        extractor: 'defuddle',
      },
      tagNames: ['Reading', 'Later'],
      highlights: [{ text: 'kept', anchor: { quote: 'kept' }, contentVersion: 2, color: 'yellow' }],
      linkRef: { url: 'https://example.com/a', folderPath: ['Inbox'] },
    };

    const transaction = {
      trashItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'trash-1', userId: OWNER, kind: 'clip', entityId: 11, label: 'Kept', payload: clipPayload,
        }),
        delete: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      clip: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 11, ...data })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      clipTag: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 3, ...data })),
      },
      clipTagOnClip: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      clipHighlight: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      link: { findMany: vi.fn().mockResolvedValue([{ id: 42, url: 'https://example.com/a', folderId: 5 }]) },
      folder: { findFirst: vi.fn().mockResolvedValue({ id: 5, name: 'Inbox', parentId: null, userId: OWNER }), findMany: vi.fn().mockResolvedValue([{ id: 5, name: 'Inbox', parentId: null, userId: OWNER }]) },
      ...overrides,
    };

    const prisma = { ...transaction, $transaction: vi.fn(async (op: any) => op(transaction)) };
    return { prisma, transaction, clipPayload };
  }

  it('restores a clip with its tags and highlights', async () => {
    const { prisma, transaction } = trashFixture();
    const repo = createPrismaRepository(prisma as never);

    await repo.restoreTrashItem(OWNER, 'trash-1');

    expect(transaction.clip.create).toHaveBeenCalled();
    expect(transaction.clip.create.mock.calls[0][0].data).toMatchObject({ userId: OWNER, title: 'Kept' });
    expect(transaction.clipTagOnClip.createMany).toHaveBeenCalled();
    expect(transaction.clipHighlight.createMany).toHaveBeenCalled();
    expect(transaction.trashItem.delete).toHaveBeenCalled();
  });

  it('reattaches the bookmark only when the reference resolves to exactly one link', async () => {
    const { prisma, transaction } = trashFixture();
    const repo = createPrismaRepository(prisma as never);

    await repo.restoreTrashItem(OWNER, 'trash-1');

    expect(transaction.clip.create.mock.calls[0][0].data.linkId).toBe(42);
  });

  it('leaves the clip detached when the bookmark reference is ambiguous', async () => {
    const { prisma, transaction } = trashFixture();
    transaction.link.findMany.mockResolvedValue([
      { id: 42, url: 'https://example.com/a', folderId: 5 },
      { id: 43, url: 'https://example.com/a', folderId: 5 },
    ]);
    const repo = createPrismaRepository(prisma as never);

    await repo.restoreTrashItem(OWNER, 'trash-1');

    expect(transaction.clip.create.mock.calls[0][0].data.linkId).toBeNull();
  });

  it('leaves the clip detached when the bookmark is gone', async () => {
    const { prisma, transaction } = trashFixture();
    transaction.link.findMany.mockResolvedValue([]);
    const repo = createPrismaRepository(prisma as never);

    await repo.restoreTrashItem(OWNER, 'trash-1');

    expect(transaction.clip.create.mock.calls[0][0].data.linkId).toBeNull();
  });

  it('rejects an unknown trash kind instead of restoring it as a folder', async () => {
    const { prisma, transaction } = trashFixture();
    transaction.trashItem.findFirst.mockResolvedValue({
      id: 'trash-9', userId: OWNER, kind: 'something-new', entityId: 1, label: 'x', payload: {},
    });
    const repo = createPrismaRepository(prisma as never);

    await expect(repo.restoreTrashItem(OWNER, 'trash-9')).rejects.toThrow(/unsupported|unknown/i);
    expect(transaction.folder.findFirst).not.toHaveBeenCalled();
  });

  it('does not read a trash item belonging to another user', async () => {
    const { prisma, transaction } = trashFixture();
    transaction.trashItem.findFirst.mockResolvedValue(null);
    const repo = createPrismaRepository(prisma as never);

    await expect(repo.restoreTrashItem(8, 'trash-1')).rejects.toThrow();
    expect(transaction.trashItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'trash-1', userId: 8 } }),
    );
  });

  it('reattaches clips when the bookmark itself is restored', async () => {
    const { prisma, transaction } = trashFixture();
    transaction.trashItem.findFirst.mockResolvedValue({
      id: 'trash-2',
      userId: OWNER,
      kind: 'bookmark',
      entityId: 42,
      label: 'Example',
      payload: {
        link: { id: 42, folderId: 5, name: 'Example', url: 'https://example.com/a', sortOrder: 0 },
        linkedClipIds: [11],
      },
    });
    Object.assign(transaction, { link: { ...transaction.link, findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 42 }) } });
    const repo = createPrismaRepository(prisma as never);

    await repo.restoreTrashItem(OWNER, 'trash-2');

    expect(transaction.clip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [11] }, userId: OWNER },
        data: { linkId: 42 },
      }),
    );
  });
});
