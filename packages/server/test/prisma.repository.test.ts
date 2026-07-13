import { describe, expect, it, vi } from 'vitest';
import { createPrismaRepository } from '../src/services/prisma.repository.js';

describe('Prisma repository folder deletion', () => {
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
});
