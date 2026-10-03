import { describe, expect, it, vi } from 'vitest';
import { importBookmarks } from '../src/services/bookmark.service.js';
import { MemoryRepository } from '../src/services/repository.js';
import { createPrismaRepository } from '../src/services/prisma.repository.js';

const html = [
  '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>',
  '<DT><H3>Dev</H3><DL><p>',
  '<DT><H3>Docs</H3><DL><p><DT><A HREF="https://docs.example/">Docs</A></DL><p>',
  '<DT><A HREF="https://one.example/">One</A>',
  '<DT><A HREF="https://two.example/">Two</A>',
  '<DT><A HREF="https://github.com/">Dup</A>',
  '<DT><A HREF="chrome://bookmarks/">Bad</A>',
  '</DL><p></DL><p>',
].join('');

describe('bookmark import', () => {
  it('imports folders and links and reports skips', async () => {
    const repo = new MemoryRepository();
    const summary = await importBookmarks(repo, 1, html);

    expect(summary).toEqual({ addedFolders: 2, addedLinks: 3, skippedDuplicates: 1, skippedInvalid: 1 });
    const dev = repo.folders.find((folder) => folder.name === 'Dev')!;
    const docs = repo.folders.find((folder) => folder.name === 'Docs')!;
    expect(docs.parentId).toBe(dev.id);
    expect(repo.links.find((link) => link.url === 'https://docs.example/')?.folderId).toBe(docs.id);
    expect(repo.links.find((link) => link.url === 'https://one.example/')?.folderId).toBe(dev.id);
  });

  it('leaves no new folders or links when a write fails mid-import', async () => {
    const repo = new MemoryRepository();
    const foldersBefore = structuredClone(repo.folders);
    const linksBefore = structuredClone(repo.links);
    const createLink = repo.createLink.bind(repo);
    let calls = 0;
    vi.spyOn(repo, 'createLink').mockImplementation(async (input) => {
      calls += 1;
      if (calls === 2) throw new Error('disk full');
      return createLink(input);
    });

    await expect(importBookmarks(repo, 1, html)).rejects.toThrow('disk full');

    expect(calls).toBe(2);
    expect(repo.folders).toEqual(foldersBefore);
    expect(repo.links).toEqual(linksBefore);
  });

  it('creates a fallback folder inside the same import when the user has none', async () => {
    const repo = new MemoryRepository(false);
    await repo.createUser({ username: 'u', email: 'u@x.test', displayName: 'U', passwordHash: '', role: 'admin' });
    const summary = await importBookmarks(repo, 1, '<DL><p><DT><A HREF="https://loose.example/">Loose</A></DL><p>');

    expect(summary).toMatchObject({ addedFolders: 1, addedLinks: 1 });
    expect(repo.links[0].folderId).toBe(repo.folders[0].id);
  });

  it('runs the Prisma import in one transaction with one bulk link insert', async () => {
    let nextId = 100;
    const transaction = {
      folder: { create: vi.fn(async ({ data }: any) => ({ ...data, id: nextId++ })) },
      link: { createMany: vi.fn(async ({ data }: any) => ({ count: data.length })) },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
      folder: { findMany: vi.fn().mockResolvedValue([{ id: 1, userId: 1, parentId: null, sortOrder: 1 }]) },
      link: { findMany: vi.fn().mockResolvedValue([{ id: 1, url: 'https://github.com/' }]) },
    };
    const repo = createPrismaRepository(prisma as never);

    const summary = await importBookmarks(repo, 1, html);

    expect(summary).toEqual({ addedFolders: 2, addedLinks: 3, skippedDuplicates: 1, skippedInvalid: 1 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.folder.create).toHaveBeenCalledTimes(2);
    expect(transaction.folder.create.mock.calls[1][0].data).toMatchObject({ name: 'Docs', parentId: 100, userId: 1 });
    expect(transaction.link.createMany).toHaveBeenCalledOnce();
    expect(transaction.link.createMany.mock.calls[0][0].data.map((link: any) => [link.url, link.folderId])).toEqual([
      ['https://docs.example/', 101],
      ['https://one.example/', 100],
      ['https://two.example/', 100],
    ]);
  });
});
