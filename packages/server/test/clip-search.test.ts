import { describe, expect, it, vi } from 'vitest';
import {
  MAX_CLIP_SEARCH_PAGE_SIZE,
  MAX_CLIP_SEARCH_QUERY_LENGTH,
  createClipSearch,
  escapeLikePattern,
} from '../src/services/clip-search.js';

function stubPrisma(rows: Array<Record<string, unknown>> = []) {
  const calls: Array<{ strings: string[]; values: unknown[] }> = [];
  const prisma = {
    $queryRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings: [...strings], values });
      return Promise.resolve(rows);
    }),
  };
  return { prisma, calls };
}

describe('LIKE pattern escaping', () => {
  it('escapes the wildcard characters', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('c:\\path')).toBe('c:\\\\path');
  });

  it('leaves ordinary text alone, including CJK', () => {
    expect(escapeLikePattern('剪藏 clipper')).toBe('剪藏 clipper');
  });
});

describe('clip search', () => {
  it('always binds the authenticated user into the query', async () => {
    const { prisma, calls } = stubPrisma();
    const search = createClipSearch(prisma as never);

    await search(7, 'anything');

    expect(calls[0].values).toContain(7);
    expect(calls[0].strings.join('?')).toContain('"userId" =');
  });

  it('matches a Chinese substring', async () => {
    const { prisma, calls } = stubPrisma([{ id: 1, title: '剪藏模块' }]);
    const search = createClipSearch(prisma as never);

    const result = await search(7, '剪藏');

    expect(calls[0].values).toContain('%剪藏%');
    expect(result.items).toHaveLength(1);
  });

  it('matches an ASCII substring', async () => {
    const { prisma, calls } = stubPrisma();
    const search = createClipSearch(prisma as never);

    await search(7, 'fastify');

    expect(calls[0].values).toContain('%fastify%');
  });

  it('escapes wildcards inside the bound pattern', async () => {
    const { prisma, calls } = stubPrisma();
    const search = createClipSearch(prisma as never);

    await search(7, '50%_off');

    expect(calls[0].values).toContain('%50\\%\\_off%');
  });

  it('passes the pattern as a bound parameter rather than inlining it', async () => {
    const { prisma, calls } = stubPrisma();
    const search = createClipSearch(prisma as never);

    await search(7, "'; DROP TABLE \"Clip\"; --");

    const sql = calls[0].strings.join('');
    expect(sql).not.toContain('DROP TABLE');
    expect(calls[0].values.some((value) => String(value).includes('DROP TABLE'))).toBe(true);
  });

  it('caps the query length', async () => {
    const { prisma, calls } = stubPrisma();
    const search = createClipSearch(prisma as never);

    await search(7, 'a'.repeat(MAX_CLIP_SEARCH_QUERY_LENGTH + 50));

    const pattern = calls[0].values.find((value) => typeof value === 'string' && String(value).startsWith('%'));
    expect(String(pattern)).toHaveLength(MAX_CLIP_SEARCH_QUERY_LENGTH + 2);
  });

  it('caps the page size', async () => {
    const { prisma, calls } = stubPrisma();
    const search = createClipSearch(prisma as never);

    const result = await search(7, 'x', { limit: 5000 });

    expect(result.limit).toBe(MAX_CLIP_SEARCH_PAGE_SIZE);
    expect(calls[0].values).toContain(MAX_CLIP_SEARCH_PAGE_SIZE);
  });

  it('pages with limit and offset', async () => {
    const { prisma, calls } = stubPrisma();
    const search = createClipSearch(prisma as never);

    await search(7, 'x', { limit: 10, offset: 40 });

    expect(calls[0].values).toContain(10);
    expect(calls[0].values).toContain(40);
  });

  it('never selects article bodies', async () => {
    const { prisma, calls } = stubPrisma();
    const search = createClipSearch(prisma as never);

    await search(7, 'x');

    const sql = calls[0].strings.join('');
    expect(sql).not.toContain('contentHtml');
    expect(sql).not.toContain('contentMd');
    expect(sql).toContain('"excerpt"');
  });

  it('short-circuits an empty query without touching the database', async () => {
    const { prisma } = stubPrisma();
    const search = createClipSearch(prisma as never);

    const result = await search(7, '   ');

    expect(result.items).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
