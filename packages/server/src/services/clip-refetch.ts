import { Defuddle } from 'defuddle/node';
import type { PrismaClient } from '@prisma/client';
import type { requestSafeResource } from '../utils/safe-fetch.js';
import {
  ClipValidationError,
  clipContentHash,
  clipExcerpt,
  sanitizeClipHtml,
  validateClipPayloadSizes,
} from './clip-content.js';

/**
 * Re-fetches a clip's source and replaces its body.
 *
 * The request goes through the shared safe requester rather than a fresh fetch. That layer resolves
 * DNS first, rejects loopback/private/link-local/metadata addresses, and re-validates on every
 * redirect. Opening a second HTTP path here would be an SSRF hole that bypasses all of it: this is
 * a user-supplied URL fetched by the server on demand, which is the textbook shape of the bug.
 */

export const CLIP_REFETCH_MAX_BYTES = 4 * 1024 * 1024;
export const CLIP_REFETCH_MAX_REDIRECTS = 3;
export const CLIP_REFETCH_TIMEOUT_MS = 10_000;

export interface ClipRefetchDeps {
  prisma: PrismaClient;
  safeRequester: typeof requestSafeResource;
  privateOutboundHosts: string[];
}

export function createClipRefetch({ prisma, safeRequester, privateOutboundHosts }: ClipRefetchDeps) {
  return async function refetchClip(
    user: { id: number; role: string },
    clipId: number,
    allowPrivateAccess = false,
  ) {
    const clip = await prisma.clip.findFirst({ where: { id: clipId, userId: user.id } });
    if (!clip) return null;

    const response = await safeRequester(clip.url, {
      method: 'GET',
      maxBytes: CLIP_REFETCH_MAX_BYTES,
      maxRedirects: CLIP_REFETCH_MAX_REDIRECTS,
      timeoutMs: CLIP_REFETCH_TIMEOUT_MS,
      // The private-host allowlist widens what the server may reach. The route grants it only to a
      // tracked administrator browser session; bearer tokens never inherit it from the user role.
      allowPrivateHosts: user.role === 'admin' && allowPrivateAccess ? privateOutboundHosts : [],
      headers: { accept: 'text/html,application/xhtml+xml' },
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new ClipValidationError(`Source responded with HTTP ${response.statusCode}`, 'url');
    }

    const contentType = String(response.headers['content-type'] || '');
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new ClipValidationError(`Source is not HTML (${contentType})`, 'url');
    }

    const finalUrl = response.finalUrl || clip.url;
    const parsed = await Defuddle(response.body.toString('utf8'), finalUrl, {
      separateMarkdown: true,
      useAsync: false,
    });

    const contentHtml = sanitizeClipHtml(parsed.content || '', finalUrl);
    const contentMd = parsed.contentMarkdown || '';
    validateClipPayloadSizes({ contentHtml, contentMd });

    const contentHash = clipContentHash(contentHtml, contentMd);
    const changed = contentHash !== clip.contentHash;

    return prisma.clip.update({
      where: { id: clip.id },
      data: {
        contentHtml,
        contentMd,
        contentHash,
        excerpt: clipExcerpt(contentMd),
        title: parsed.title || clip.title,
        author: parsed.author || clip.author,
        siteName: parsed.site || clip.siteName,
        wordCount: parsed.wordCount || clip.wordCount,
        contentTruncated: false,
        // Only a real change advances the version, so highlights anchored to unchanged text keep
        // resolving instead of all going stale on every refetch.
        contentVersion: changed ? clip.contentVersion + 1 : clip.contentVersion,
      },
    });
  };
}

export type ClipRefetch = ReturnType<typeof createClipRefetch>;
