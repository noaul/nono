import { describe, expect, it, vi } from 'vitest';
import { createPrismaRepository } from '../src/services/prisma.repository.js';

describe('Prisma repository batch deletion', () => {
  it('treats a folder already removed by cascade as deleted', async () => {
    const prisma = {
      folder: {
        findFirstOrThrow: vi.fn().mockRejectedValue(new Error('Record not found')),
        delete: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const repo = createPrismaRepository(prisma as never);

    await expect(repo.deleteFolder(1, 168)).resolves.toBeUndefined();
    expect(prisma.folder.deleteMany).toHaveBeenCalledWith({ where: { userId: 1, id: 168 } });
  });

  it('deletes selected folder roots within the current user', async () => {
    const prisma = {
      folder: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const repo = createPrismaRepository(prisma as never);

    await repo.deleteFolders(7, [12, 18]);

    expect(prisma.folder.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, id: { in: [12, 18] } },
    });
  });

  it('deletes selected links only when their folder belongs to the current user', async () => {
    const prisma = {
      link: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const repo = createPrismaRepository(prisma as never);

    await repo.deleteLinks(7, [21, 34]);

    expect(prisma.link.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [21, 34] }, folder: { userId: 7 } },
    });
  });
});
