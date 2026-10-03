import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireBrowserSession } from '../../plugins/auth.js';
import { sendError, sendOk } from '../../plugins/responses.js';
import { setAuditContext } from '../../plugins/audit.js';
import { shortenBookmarkName } from '../../services/bookmark-name.service.js';
import { shouldSkipLinkHealthCheck } from '../../services/link-health.service.js';
import type { MobileBookmarkRequestRecord } from '../../services/repository.js';
import { createSortOrder } from '../../utils/sort-order.js';

export const MOBILE_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
const MAX_URL_LENGTH = 4096;

const mobileBookmarkSchema = z.object({
  requestId: z.string().regex(MOBILE_REQUEST_ID_PATTERN, 'requestId must be 8-80 letters, digits, ".", "_", ":" or "-"'),
  folderId: z.coerce.number().int().positive(),
  name: z.string().trim().max(240).optional().default(''),
  url: z.string().trim().min(1).max(MAX_URL_LENGTH),
  description: z.string().trim().max(2000).nullable().optional(),
});

/**
 * Share-sheet saves from the Android app. Browser session only (the global onRequest hook already
 * enforces Origin / Sec-Fetch-Site on cookie writes); API tokens are not accepted here.
 */
export async function mobileBookmarkRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/mobile/bookmarks', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const body = mobileBookmarkSchema.parse(request.body);
    const url = normalizeShareUrl(body.url);
    if (!url) return sendError(reply, 400, 'URL must be a valid http:// or https:// address of at most 4096 characters');
    const description = body.description || '';
    const contentHash = createHash('sha256')
      .update(JSON.stringify([body.folderId, body.name, url, description]))
      .digest('hex');

    const prior = await services.repo.findMobileBookmarkRequest(user.id, body.requestId);
    if (prior) return replay(reply, services, user.id, prior, contentHash, request);

    const result = await services.repo.saveMobileBookmark(user.id, {
      requestId: body.requestId,
      contentHash,
      folderId: body.folderId,
      link: {
        name: body.name || shortenBookmarkName('', url),
        url,
        icon: '',
        description,
        sortOrder: createSortOrder(),
        healthCheckEnabled: !shouldSkipLinkHealthCheck(url),
      },
    });
    if (result.status === 'claimed') {
      const stored = await services.repo.findMobileBookmarkRequest(user.id, body.requestId);
      if (!stored) throw new Error('Mobile bookmark request was claimed but cannot be read');
      return replay(reply, services, user.id, stored, contentHash, request);
    }
    if (result.outcome === 'existing') {
      setAuditContext(request, { skip: true });
      return sendOk(reply, { ...result.link, existing: true });
    }
    setAuditContext(request, {
      action: 'create',
      resourceType: 'bookmark',
      resourceId: result.link.id,
      resourceLabel: result.link.name,
      details: { source: 'mobile-share', after: { id: result.link.id, folderId: result.link.folderId, name: result.link.name, url: result.link.url } },
    });
    return sendOk(reply, result.link);
  });
}

async function replay(
  reply: FastifyReply,
  services: AppServices,
  userId: number,
  stored: MobileBookmarkRequestRecord,
  contentHash: string,
  request: Parameters<typeof setAuditContext>[0],
) {
  if (stored.contentHash !== contentHash) {
    return sendError(reply, 409, 'This requestId was already used for a different bookmark');
  }
  setAuditContext(request, { skip: true });
  const link = stored.linkId ? await services.repo.getLink(userId, stored.linkId) : null;
  if (!link) return sendError(reply, 410, 'The bookmark saved by this request no longer exists');
  return sendOk(reply, stored.outcome === 'existing' ? { ...link, existing: true } : link);
}

function normalizeShareUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.length <= MAX_URL_LENGTH ? url.href : null;
  } catch {
    return null;
  }
}
