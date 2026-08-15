import type { PrismaClient } from '@prisma/client';
import {
  ClipValidationError,
  canonicalizeClipUrl,
  clipContentHash,
  clipExcerpt,
  sanitizeClipHtml,
  validateClipPayloadSizes,
} from './clip-content.js';

/**
 * Every read and write here is scoped by the authenticated user id.
 *
 * `Link` carries no `userId` of its own — ownership is only derivable through `folder.userId` — so
 * bookmark association is verified with an explicit `folder: { userId }` predicate inside the same
 * transaction that writes the row.
 */

export const CLIP_STATUSES = ['unread', 'reading', 'archived'] as const;
export type ClipStatus = typeof CLIP_STATUSES[number];

// The list view never carries article bodies: they are large, and the list is the hottest query.
const LIST_SELECT = {
  id: true,
  url: true,
  canonicalUrl: true,
  title: true,
  author: true,
  siteName: true,
  domain: true,
  description: true,
  excerpt: true,
  wordCount: true,
  favicon: true,
  image: true,
  publishedAt: true,
  status: true,
  starred: true,
  extractor: true,
  contentTruncated: true,
  contentVersion: true,
  linkId: true,
  clippedAt: true,
  updatedAt: true,
} as const;

export interface ClipIngestInput {
  url: string;
  canonicalUrl?: string | null;
  title: string;
  author?: string | null;
  siteName?: string | null;
  description?: string | null;
  contentHtml: string;
  contentMd: string;
  contentTruncated?: boolean;
  wordCount?: number;
  lang?: string | null;
  favicon?: string | null;
  image?: string | null;
  publishedAt?: string | null;
  extractor: string;
  sourceMeta?: unknown;
  linkId?: number | null;
}

export interface ClipListQuery {
  status?: ClipStatus;
  starred?: boolean;
  domain?: string;
  tagId?: number;
  limit?: number;
  offset?: number;
}

export interface ClipHighlightInput {
  text: string;
  note?: string | null;
  color?: string;
  anchor: {
    quote: string;
    prefix?: string;
    suffix?: string;
    startOffset?: number;
    endOffset?: number;
  };
}

export function createClipService(prisma: PrismaClient) {
  return {
    async upsert(userId: number, input: ClipIngestInput) {
      validateClipPayloadSizes(input);

      const canonicalUrl = canonicalizeClipUrl(input.url, input.canonicalUrl ?? null);
      const contentHtml = sanitizeClipHtml(input.contentHtml, canonicalUrl);
      const contentMd = String(input.contentMd ?? '');

      // Re-check after sanitization: rewriting relative URLs to absolute ones can only grow the
      // document, and the stored value is what has to stay inside the limit.
      validateClipPayloadSizes({ contentHtml, contentMd, sourceMeta: input.sourceMeta });

      const fields = {
        url: input.url,
        canonicalUrl,
        title: input.title || canonicalUrl,
        author: input.author || null,
        siteName: input.siteName || null,
        domain: hostOf(canonicalUrl),
        description: input.description || null,
        excerpt: clipExcerpt(contentMd),
        contentHtml,
        contentMd,
        contentHash: clipContentHash(contentHtml, contentMd),
        contentTruncated: Boolean(input.contentTruncated),
        wordCount: Number.isFinite(input.wordCount) ? Number(input.wordCount) : 0,
        lang: input.lang || null,
        favicon: input.favicon || null,
        image: input.image || null,
        publishedAt: parseDate(input.publishedAt),
        extractor: input.extractor || 'defuddle',
        sourceMeta: (input.sourceMeta ?? null) as never,
      };

      return prisma.$transaction(async (tx) => {
        if (input.linkId != null) await assertOwnedLink(tx, userId, input.linkId);

        const existing = await tx.clip.findUnique({
          where: { userId_canonicalUrl: { userId, canonicalUrl } },
        });

        if (existing) {
          return tx.clip.update({
            where: { id: existing.id },
            data: {
              ...fields,
              // Only bump the version when the body actually changed, so highlights captured
              // against unchanged text keep resolving.
              contentVersion: existing.contentHash === fields.contentHash
                ? existing.contentVersion
                : existing.contentVersion + 1,
              ...(input.linkId != null ? { linkId: input.linkId } : {}),
            },
          });
        }

        return tx.clip.create({
          data: { ...fields, userId, linkId: input.linkId ?? null },
        });
      });
    },

    async list(userId: number, query: ClipListQuery) {
      const limit = clampLimit(query.limit);
      const offset = Math.max(0, Number(query.offset) || 0);

      const where = {
        userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.starred != null ? { starred: query.starred } : {}),
        ...(query.domain ? { domain: query.domain } : {}),
        ...(query.tagId ? { tags: { some: { tagId: query.tagId, userId } } } : {}),
      };

      const [items, total] = await Promise.all([
        prisma.clip.findMany({
          where,
          select: LIST_SELECT,
          orderBy: { clippedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.clip.count({ where }),
      ]);

      return { items, total, limit, offset };
    },

    async get(userId: number, id: number) {
      return prisma.clip.findFirst({
        where: { id, userId },
        include: {
          tags: { include: { tag: true } },
          highlights: { orderBy: { createdAt: 'asc' } },
        },
      });
    },

    async update(userId: number, id: number, patch: { status?: ClipStatus; starred?: boolean; title?: string; linkId?: number | null }) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.clip.findFirst({ where: { id, userId }, select: { id: true } });
        if (!existing) return null;

        if (patch.linkId != null) await assertOwnedLink(tx, userId, patch.linkId);

        return tx.clip.update({
          where: { id: existing.id },
          data: {
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.starred != null ? { starred: patch.starred } : {}),
            ...(patch.title ? { title: patch.title } : {}),
            ...(patch.linkId !== undefined ? { linkId: patch.linkId } : {}),
          },
        });
      });
    },

    async removeToTrash(userId: number, id: number) {
      return prisma.$transaction(async (tx) => {
        const clip = await tx.clip.findFirst({ where: { id, userId } });
        if (!clip) return false;

        await tx.trashItem.create({
          data: {
            userId,
            kind: 'clip',
            entityId: clip.id,
            label: clip.title,
            payload: { version: 1, clip } as never,
          },
        });

        await tx.clip.deleteMany({ where: { id, userId } });
        return true;
      });
    },

    async assignTags(userId: number, clipId: number, tagIds: number[]) {
      const wanted = [...new Set(tagIds.filter((value) => Number.isInteger(value)))];

      return prisma.$transaction(async (tx) => {
        const clip = await tx.clip.findFirst({ where: { id: clipId, userId }, select: { id: true } });
        if (!clip) throw new ClipValidationError('Clip not found', 'clipId');

        if (wanted.length > 0) {
          const owned = await tx.clipTag.findMany({
            where: { id: { in: wanted }, userId },
            select: { id: true },
          });
          if (owned.length !== wanted.length) {
            throw new ClipValidationError('One or more tags do not belong to this user', 'tagIds');
          }
        }

        await tx.clipTagOnClip.deleteMany({ where: { clipId, userId } });
        if (wanted.length > 0) {
          await tx.clipTagOnClip.createMany({
            data: wanted.map((tagId) => ({ clipId, tagId, userId })),
            skipDuplicates: true,
          });
        }
        return wanted.length;
      });
    },

    async addHighlight(userId: number, clipId: number, input: ClipHighlightInput) {
      return prisma.$transaction(async (tx) => {
        const clip = await tx.clip.findFirst({
          where: { id: clipId, userId },
          select: { id: true, contentVersion: true },
        });
        if (!clip) throw new ClipValidationError('Clip not found', 'clipId');

        return tx.clipHighlight.create({
          data: {
            clipId: clip.id,
            userId,
            text: input.text,
            note: input.note || null,
            color: input.color || 'yellow',
            anchor: input.anchor as never,
            // Stamped so the reader can tell a stale anchor from a resolvable one.
            contentVersion: clip.contentVersion,
          },
        });
      });
    },

    async removeHighlight(userId: number, id: number) {
      return prisma.$transaction(async (tx) => {
        const result = await tx.clipHighlight.deleteMany({ where: { id, userId } });
        return result.count > 0;
      });
    },
  };
}

export type ClipService = ReturnType<typeof createClipService>;

async function assertOwnedLink(tx: { link: { findFirst: (args: unknown) => Promise<unknown> } }, userId: number, linkId: number) {
  const link = await tx.link.findFirst({ where: { id: linkId, folder: { userId } } });
  if (!link) throw new ClipValidationError('Bookmark not found', 'linkId');
  return link;
}

function clampLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.min(100, Math.floor(parsed));
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hostOf(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}
