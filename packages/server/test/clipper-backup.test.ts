import { describe, expect, it, vi } from 'vitest';
import { BACKUP_MODULES } from '../src/services/backup-center.service.js';
import { createBackupModuleAdapters } from '../src/services/backup-module-adapters.js';

const OWNER = 7;

function stubPrisma(overrides: Record<string, any> = {}) {
  const state = {
    clips: [
      {
        id: 11,
        userId: OWNER,
        linkId: 42,
        url: 'https://example.com/a',
        canonicalUrl: 'https://example.com/a',
        title: 'Kept',
        domain: 'example.com',
        excerpt: 'kept',
        contentHtml: '<p>kept</p>',
        contentMd: 'kept',
        contentHash: 'hash',
        contentVersion: 2,
        contentTruncated: false,
        extractor: 'defuddle',
        status: 'unread',
        starred: false,
        wordCount: 3,
        clippedAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        link: { id: 42, url: 'https://example.com/a', folderId: 5 },
        tags: [{ tag: { name: 'Reading', normalizedName: 'reading', color: null } }],
        highlights: [{ text: 'kept', note: null, color: 'yellow', anchor: { quote: 'kept' }, contentVersion: 2 }],
      },
    ],
    created: [] as any[],
    tagRows: [] as any[],
    joinRows: [] as any[],
    highlightRows: [] as any[],
  };

  const prisma: any = {
    clip: {
      findMany: vi.fn(async () => state.clips),
      deleteMany: vi.fn(async () => ({ count: state.clips.length })),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 100 + state.created.length, ...data };
        state.created.push(row);
        return row;
      }),
    },
    clipTag: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 200 + state.tagRows.length, ...data };
        state.tagRows.push(row);
        return row;
      }),
    },
    clipTagOnClip: { createMany: vi.fn(async ({ data }: any) => { state.joinRows.push(...data); return { count: data.length }; }) },
    clipHighlight: { createMany: vi.fn(async ({ data }: any) => { state.highlightRows.push(...data); return { count: data.length }; }) },
    link: { findMany: vi.fn(async () => [{ id: 999, url: 'https://example.com/a', folderId: 5 }]) },
    folder: { findFirst: vi.fn(async () => ({ name: 'Inbox', parentId: null })) },
    ...overrides,
  };
  prisma.$transaction = vi.fn(async (operation: any) => operation(prisma));
  return { prisma, state };
}

function adapters(prisma: any) {
  return createBackupModuleAdapters({
    prisma,
    encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    nodeskContentDir: '/tmp/nodesk',
    now: () => new Date('2026-08-15T00:00:00.000Z'),
  });
}

describe('Clipper backup module', () => {
  it('is registered immediately after nono so bookmarks exist before clips are restored', () => {
    expect(BACKUP_MODULES).toContain('clipper');
    expect(BACKUP_MODULES.indexOf('clipper')).toBe(BACKUP_MODULES.indexOf('nono') + 1);
  });

  it('exports clips with their tags and highlights', async () => {
    const { prisma } = stubPrisma();
    const artifact = JSON.parse((await adapters(prisma).clipper.export(OWNER)).toString('utf8'));

    expect(artifact.kind).toBe('nono.clipper-backup');
    expect(artifact.version).toBe(1);
    expect(artifact.module).toBe('clipper');
    expect(artifact.clips).toHaveLength(1);
    expect(artifact.clips[0].tagNames).toEqual(['Reading']);
    expect(artifact.clips[0].highlights).toHaveLength(1);
    expect(artifact.clips[0].contentMd).toBe('kept');
  });

  it('serializes the bookmark as a stable reference, never as a raw id', async () => {
    const { prisma } = stubPrisma();
    const artifact = JSON.parse((await adapters(prisma).clipper.export(OWNER)).toString('utf8'));

    expect(artifact.clips[0].linkRef).toEqual({
      normalizedUrl: 'https://example.com/a',
      folderPath: ['Inbox'],
    });
    // Nono restores bookmarks with fresh autoincrement ids, so a stored id would point at whatever
    // row happens to occupy it after a restore.
    expect(artifact.clips[0].linkId).toBeUndefined();
    expect(JSON.stringify(artifact)).not.toContain('"linkId"');
  });

  it('rejects an artifact of the wrong kind', async () => {
    const { prisma } = stubPrisma();
    await expect(adapters(prisma).clipper.validate(Buffer.from(JSON.stringify({ kind: 'nono.nostar-backup', version: 1 }))))
      .rejects.toThrow();
  });

  it('validates before deleting anything', async () => {
    const { prisma } = stubPrisma();
    await expect(adapters(prisma).clipper.restore(OWNER, Buffer.from('not json'))).rejects.toThrow();
    expect(prisma.clip.deleteMany).not.toHaveBeenCalled();
  });
});

describe('Clipper backup restore', () => {
  async function roundTrip(prisma: any, linkRows: any[]) {
    const artifact = await adapters(prisma).clipper.export(OWNER);
    const target = stubPrisma({ link: { findMany: vi.fn(async () => linkRows) } });
    await adapters(target.prisma).clipper.restore(OWNER, artifact);
    return target;
  }

  it('reattaches a bookmark that was regenerated with a new id', async () => {
    const { prisma } = stubPrisma();
    const target = await roundTrip(prisma, [{ id: 999, url: 'https://example.com/a', folderId: 5 }]);

    expect(target.state.created).toHaveLength(1);
    // The bookmark now has id 999 rather than the 42 it had when the backup was taken.
    expect(target.state.created[0].linkId).toBe(999);
  });

  it('leaves the clip detached when no bookmark matches', async () => {
    const { prisma } = stubPrisma();
    const target = await roundTrip(prisma, []);

    expect(target.state.created[0].linkId).toBeNull();
  });

  it('leaves the clip detached when the reference is ambiguous', async () => {
    const { prisma } = stubPrisma();
    const target = await roundTrip(prisma, [
      { id: 999, url: 'https://example.com/a', folderId: 5 },
      { id: 1000, url: 'https://example.com/a', folderId: 6 },
    ]);

    expect(target.state.created[0].linkId).toBeNull();
  });

  it('recreates tags and highlights for the restored clip', async () => {
    const { prisma } = stubPrisma();
    const target = await roundTrip(prisma, [{ id: 999, url: 'https://example.com/a', folderId: 5 }]);

    expect(target.state.tagRows.map((tag) => tag.name)).toEqual(['Reading']);
    expect(target.state.joinRows[0]).toMatchObject({ userId: OWNER });
    expect(target.state.highlightRows[0]).toMatchObject({ userId: OWNER, text: 'kept', contentVersion: 2 });
  });

  it('clears the existing Clipper rows for that user before restoring', async () => {
    const { prisma } = stubPrisma();
    const target = await roundTrip(prisma, []);

    expect(target.prisma.clip.deleteMany).toHaveBeenCalledWith({ where: { userId: OWNER } });
    expect(target.prisma.clipTag.deleteMany).toHaveBeenCalledWith({ where: { userId: OWNER } });
  });
});
