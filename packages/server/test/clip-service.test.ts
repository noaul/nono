import { describe, expect, it, vi } from 'vitest';
import { ClipValidationError } from '../src/services/clip-content.js';
import { createClipService } from '../src/services/clip.service.js';

const OWNER = 7;
const INTRUDER = 8;

function clipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: OWNER,
    linkId: null,
    url: 'https://example.com/a',
    canonicalUrl: 'https://example.com/a',
    title: 'A',
    excerpt: 'a',
    contentHtml: '<p>a</p>',
    contentMd: 'a',
    contentVersion: 1,
    contentHash: 'hash',
    contentTruncated: false,
    domain: 'example.com',
    status: 'unread',
    starred: false,
    extractor: 'defuddle',
    clippedAt: new Date(),
    ...overrides,
  };
}

function stubPrisma(overrides: Record<string, unknown> = {}) {
  const transaction = {
    clip: {
      findFirst: vi.fn().mockResolvedValue(clipRow()),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(clipRow()),
      update: vi.fn().mockResolvedValue(clipRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([clipRow()]),
      count: vi.fn().mockResolvedValue(1),
    },
    clipTag: {
      findFirst: vi.fn().mockResolvedValue({ id: 3, userId: OWNER, name: 'Reading', normalizedName: 'reading' }),
      findMany: vi.fn().mockResolvedValue([{ id: 3, userId: OWNER, normalizedName: 'reading' }]),
      upsert: vi.fn().mockResolvedValue({ id: 3, userId: OWNER, normalizedName: 'reading' }),
    },
    clipTagOnClip: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    clipHighlight: {
      findFirst: vi.fn().mockResolvedValue({ id: 5, userId: OWNER, clipId: 1, contentVersion: 1 }),
      create: vi.fn().mockResolvedValue({ id: 5, userId: OWNER, clipId: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    link: {
      findFirst: vi.fn().mockResolvedValue({ id: 42 }),
    },
    trashItem: {
      create: vi.fn().mockResolvedValue({ id: 'trash-1' }),
    },
    ...overrides,
  };

  const prisma = {
    ...transaction,
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
  };

  return { prisma, transaction };
}

const PAYLOAD = {
  url: 'https://example.com/a',
  title: 'A',
  contentHtml: '<p>a</p>',
  contentMd: 'a',
  extractor: 'defuddle',
};

describe('clip service tenant isolation', () => {
  it('scopes detail reads to the authenticated user', async () => {
    const { prisma } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.get(OWNER, 1);

    expect(prisma.clip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 1, userId: OWNER }) }),
    );
  });

  it('scopes list reads to the authenticated user', async () => {
    const { prisma } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.list(OWNER, {});

    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: OWNER }) }),
    );
  });

  it('never returns full content from the list query', async () => {
    const { prisma } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.list(OWNER, {});

    const select = prisma.clip.findMany.mock.calls[0][0].select;
    expect(select.contentHtml).toBeFalsy();
    expect(select.contentMd).toBeFalsy();
    expect(select.sourceMeta).toBeFalsy();
    expect(select.excerpt).toBe(true);
  });

  it('scopes updates to the authenticated user', async () => {
    const { prisma, transaction } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.update(OWNER, 1, { status: 'archived' });

    expect(transaction.clip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 1, userId: OWNER }) }),
    );
  });

  it('refuses to update a clip owned by someone else', async () => {
    const { prisma, transaction } = stubPrisma();
    transaction.clip.findFirst.mockResolvedValue(null);
    const service = createClipService(prisma as never);

    await expect(service.update(INTRUDER, 1, { status: 'archived' })).resolves.toBeNull();
    expect(transaction.clip.update).not.toHaveBeenCalled();
  });

  it('scopes deletion to the authenticated user', async () => {
    const { prisma, transaction } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.removeToTrash(OWNER, 1);

    expect(transaction.clip.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 1, userId: OWNER }) }),
    );
  });
});

describe('clip service bookmark association', () => {
  it('verifies bookmark ownership through folder ancestry', async () => {
    const { prisma, transaction } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.upsert(OWNER, { ...PAYLOAD, linkId: 42 });

    // Link carries no userId of its own; ownership is only derivable through its folder.
    expect(transaction.link.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42, folder: { userId: OWNER } } }),
    );
  });

  it('refuses to attach a bookmark owned by someone else', async () => {
    const { prisma, transaction } = stubPrisma();
    transaction.link.findFirst.mockResolvedValue(null);
    const service = createClipService(prisma as never);

    await expect(service.upsert(INTRUDER, { ...PAYLOAD, linkId: 42 })).rejects.toThrow(ClipValidationError);
    expect(transaction.clip.create).not.toHaveBeenCalled();
  });
});

describe('clip service tag assignment', () => {
  it('refuses to assign a tag owned by someone else', async () => {
    const { prisma, transaction } = stubPrisma();
    transaction.clipTag.findMany.mockResolvedValue([]);
    const service = createClipService(prisma as never);

    await expect(service.assignTags(INTRUDER, 1, [3])).rejects.toThrow(ClipValidationError);
    expect(transaction.clipTagOnClip.createMany).not.toHaveBeenCalled();
  });

  it('stamps the owning user onto the join rows', async () => {
    const { prisma, transaction } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.assignTags(OWNER, 1, [3]);

    expect(transaction.clipTagOnClip.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ clipId: 1, tagId: 3, userId: OWNER }] }),
    );
  });
});

describe('clip service highlights', () => {
  it('refuses to delete a highlight owned by someone else', async () => {
    const { prisma, transaction } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.removeHighlight(INTRUDER, 5);

    expect(transaction.clipHighlight.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 5, userId: INTRUDER }) }),
    );
  });

  it('records the content version the anchor was captured against', async () => {
    const { prisma, transaction } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.addHighlight(OWNER, 1, {
      text: 'quoted',
      anchor: { quote: 'quoted', prefix: 'before ', suffix: ' after', startOffset: 7, endOffset: 13 },
    });

    expect(transaction.clipHighlight.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: OWNER, clipId: 1, contentVersion: 1 }),
      }),
    );
  });
});

describe('clip service ingest', () => {
  it('sanitizes content before it reaches the database', async () => {
    const { prisma, transaction } = stubPrisma();
    const service = createClipService(prisma as never);

    await service.upsert(OWNER, {
      ...PAYLOAD,
      contentHtml: '<p>ok</p><script>steal()</script>',
    });

    const written = transaction.clip.create.mock.calls[0][0].data;
    expect(written.contentHtml).not.toContain('<script');
    expect(written.userId).toBe(OWNER);
  });

  it('rejects oversized content rather than truncating it server-side', async () => {
    const { prisma } = stubPrisma();
    const service = createClipService(prisma as never);

    await expect(service.upsert(OWNER, { ...PAYLOAD, contentMd: 'a'.repeat(3 * 1024 * 1024) }))
      .rejects.toThrow(ClipValidationError);
  });

  it('deduplicates on the canonical URL for that user', async () => {
    const { prisma, transaction } = stubPrisma();
    transaction.clip.findUnique.mockResolvedValue(clipRow({ id: 9 }));
    const service = createClipService(prisma as never);

    await service.upsert(OWNER, { ...PAYLOAD, url: 'https://example.com/a?utm_source=x' });

    expect(transaction.clip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_canonicalUrl: { userId: OWNER, canonicalUrl: 'https://example.com/a' } },
      }),
    );
    expect(transaction.clip.update).toHaveBeenCalled();
    expect(transaction.clip.create).not.toHaveBeenCalled();
  });
});
