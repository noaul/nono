import type { PrismaClient } from '@prisma/client';

/**
 * Trigram substring search over the generated `searchText` column.
 *
 * PostgreSQL ships no Chinese parser, so a tsvector over the built-in configurations would treat a
 * CJK paragraph as one token and match almost nothing. `ILIKE '%term%'` against a GIN trigram index
 * matches substrings in any script, which is what this content needs.
 *
 * Known limit: trigrams need three characters. A one- or two-character query still returns correct
 * results but cannot use the index, so it degrades to a sequential scan. Two-character Chinese
 * queries are common, so this is the first thing to revisit if search gets slow.
 */

export const MAX_CLIP_SEARCH_QUERY_LENGTH = 200;
export const MAX_CLIP_SEARCH_PAGE_SIZE = 100;

/**
 * Escapes the LIKE metacharacters. Without this a query containing `%` matches everything and one
 * containing `_` matches any character, which reads as a broken search rather than a security
 * problem — but it is the same class of injection-by-pattern.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export interface ClipSearchResult {
  items: Array<Record<string, unknown>>;
  query: string;
  limit: number;
  offset: number;
}

export function createClipSearch(prisma: PrismaClient) {
  return async function searchClips(
    userId: number,
    rawQuery: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ClipSearchResult> {
    const query = String(rawQuery ?? '').trim().slice(0, MAX_CLIP_SEARCH_QUERY_LENGTH);
    const limit = clamp(options.limit, 30, MAX_CLIP_SEARCH_PAGE_SIZE);
    const offset = Math.max(0, Math.floor(Number(options.offset) || 0));

    if (!query) return { items: [], query: '', limit, offset };

    const pattern = `%${escapeLikePattern(query)}%`;

    // Tagged template: every interpolation is a bound parameter, never string-concatenated SQL.
    // The userId predicate is part of the query itself so a search can never cross tenants.
    // `ESCAPE '\\'` here emits a single backslash to PostgreSQL.
    const items = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        clip."id",
        clip."title",
        clip."excerpt",
        clip."domain",
        clip."status",
        clip."starred",
        clip."clippedAt",
        ARRAY(
          SELECT tag."name"
          FROM "ClipTagOnClip" AS assignment
          INNER JOIN "ClipTag" AS tag ON tag."id" = assignment."tagId"
          WHERE assignment."clipId" = clip."id"
            AND assignment."userId" = ${userId}
            AND tag."userId" = ${userId}
          ORDER BY tag."name"
        ) AS "tags"
      FROM "Clip" AS clip
      WHERE clip."userId" = ${userId}
        AND (
          clip."searchText" ILIKE ${pattern} ESCAPE '\\'
          OR EXISTS (
            SELECT 1
            FROM "ClipTagOnClip" AS matched_assignment
            INNER JOIN "ClipTag" AS matched_tag ON matched_tag."id" = matched_assignment."tagId"
            WHERE matched_assignment."clipId" = clip."id"
              AND matched_assignment."userId" = ${userId}
              AND matched_tag."userId" = ${userId}
              AND matched_tag."name" ILIKE ${pattern} ESCAPE '\\'
          )
        )
      ORDER BY clip."clippedAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { items, query, limit, offset };
  };
}

export type ClipSearch = ReturnType<typeof createClipSearch>;

function clamp(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}
