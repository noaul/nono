import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireBrowserSession } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { setAuditContext } from '../../plugins/audit.js';
import type { FolderRecord, FolderShareRecord, LinkRecord } from '../../services/repository.js';
import { decryptSecret, encryptSecret, hashApiToken } from '../../utils/crypto.js';
import { numericParam } from '../../utils/route-params.js';

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

const shareCreateSchema = z.object({
  /** Omit or null for a link that lasts until revoked. */
  expiresInDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
});

export async function shareRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/folders/:id/shares', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const folder = await services.repo.getFolder(user.id, numericParam(request));
    if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    const shares = await services.repo.listFolderShares(user.id, folder.id);
    return sendOk(reply, shares.map((share) => publicShare(share, services.encryptionKey)));
  });

  app.post('/api/admin/folders/:id/shares', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const input = shareCreateSchema.parse(request.body || {});
    const folder = await services.repo.getFolder(user.id, numericParam(request));
    if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    const token = randomBytes(18).toString('base64url');
    const share = await services.repo.createFolderShare({
      userId: user.id,
      folderId: folder.id,
      tokenHash: hashApiToken(token),
      tokenEncrypted: encryptSecret(token, services.encryptionKey),
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    });
    setAuditContext(request, { action: 'create', resourceType: 'folder_share', resourceId: share.id, resourceLabel: folder.name, details: { folderId: folder.id, expiresAt: share.expiresAt || null } });
    return sendOk(reply, publicShare(share, services.encryptionKey));
  });

  app.delete('/api/admin/shares/:id', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const id = numericParam(request);
    if (!await services.repo.deleteFolderShare(user.id, id)) throw Object.assign(new Error('Share not found'), { statusCode: 404 });
    setAuditContext(request, { action: 'delete', resourceType: 'folder_share', resourceId: id });
    return sendOk(reply, { ok: true });
  });

  // Public and read-only. Unknown, revoked and expired links all answer the same 404.
  app.get('/api/share/:token', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const token = String((request.params as { token?: string }).token || '');
    const share = SHARE_TOKEN_PATTERN.test(token) ? await services.repo.findFolderShareByHash(hashApiToken(token)) : null;
    if (!share || (share.expiresAt && share.expiresAt <= new Date())) {
      throw Object.assign(new Error('Share not found'), { statusCode: 404 });
    }
    const folders = await services.repo.listFolders(share.userId);
    const shared = sharedSubtree(folders, share.folderId);
    if (!shared.length) throw Object.assign(new Error('Share not found'), { statusCode: 404 });
    const links: LinkRecord[] = [];
    for (const folder of shared) links.push(...await services.repo.listFolderLinks(share.userId, folder.id));
    await services.repo.recordFolderShareView(share.id);
    return reply
      .header('cache-control', 'no-store')
      .header('x-robots-tag', 'noindex, nofollow')
      .header('referrer-policy', 'no-referrer')
      .send({
        code: 0,
        message: '',
        data: {
          folder: shareFolder(shared[0]),
          folders: shared.map(shareFolder),
          links: links.map(shareLink),
          expiresAt: share.expiresAt || null,
        },
      });
  });
}

/**
 * The shared folder first, then its descendants in tree order. Sharing opens the shared folder
 * itself even if it has a password; a sub-folder with its own password is left out with
 * everything below it.
 */
export function sharedSubtree(folders: FolderRecord[], rootId: number) {
  const root = folders.find((folder) => folder.id === rootId);
  if (!root) return [];
  const children = new Map<number, FolderRecord[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    children.set(folder.parentId, [...(children.get(folder.parentId) || []), folder]);
  }
  const result: FolderRecord[] = [];
  const visit = (folder: FolderRecord) => {
    result.push(folder);
    const ordered = (children.get(folder.id) || []).sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id);
    for (const child of ordered) if (!child.passwordHash && !result.includes(child)) visit(child);
  };
  visit(root);
  return result;
}

function publicShare(share: FolderShareRecord, encryptionKey: string) {
  return {
    id: share.id,
    folderId: share.folderId,
    path: `/s/${decryptSecret(share.tokenEncrypted, encryptionKey)}`,
    expiresAt: share.expiresAt || null,
    expired: Boolean(share.expiresAt && share.expiresAt <= new Date()),
    viewCount: share.viewCount,
    lastViewedAt: share.lastViewedAt || null,
    createdAt: share.createdAt,
  };
}

function shareFolder(folder: FolderRecord) {
  return {
    id: folder.id,
    parentId: folder.parentId || null,
    name: folder.name,
    icon: folder.icon || null,
    description: folder.description || null,
  };
}

function shareLink(link: LinkRecord) {
  return {
    id: link.id,
    folderId: link.folderId,
    name: link.name,
    url: link.url,
    icon: link.icon || null,
    description: link.description || null,
  };
}
