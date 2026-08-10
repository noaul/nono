import { PrismaClient } from '@prisma/client';
import type { Repository, SiteRecord } from './repository.js';
import { defaultSite } from './repository.js';
import { generateApiToken, generateSessionToken, hashApiToken, hashSessionToken } from '../utils/crypto.js';

export function createPrismaRepository(prisma = new PrismaClient()): Repository {
  return {
    async getConfig() {
      return (await prisma.appConfig.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, allowRegistration: process.env.ALLOW_REGISTRATION === 'true', defaultRole: 'user', settings: {} },
      })) as any;
    },
    async updateConfig(input) {
      return (await prisma.appConfig.upsert({
        where: { id: 1 },
        update: prune(input) as any,
        create: {
          id: 1,
          allowRegistration: input.allowRegistration ?? false,
          defaultRole: input.defaultRole || 'user',
          settings: (input.settings || {}) as any,
        },
      })) as any;
    },
    async getBackupAutomation() {
      return (await prisma.backupAutomation.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
      })) as any;
    },
    async updateBackupAutomation(input) {
      const data = prune({
        enabled: input.enabled,
        cadence: input.cadence,
        hour: input.hour,
        weekday: input.weekday,
        retentionDays: input.retentionDays,
        maxBackups: input.maxBackups,
        lastScheduledFor: input.lastScheduledFor,
        lastStartedAt: input.lastStartedAt,
        lastCompletedAt: input.lastCompletedAt,
        lastSuccessAt: input.lastSuccessAt,
        lastFailureAt: input.lastFailureAt,
        lastError: input.lastError,
      });
      return (await prisma.backupAutomation.upsert({
        where: { id: 1 },
        update: data as any,
        create: { id: 1, ...(data as any) },
      })) as any;
    },
    async getAuditConfig() {
      return (await prisma.auditConfig.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
      })) as any;
    },
    async updateAuditConfig(input) {
      return (await prisma.auditConfig.upsert({
        where: { id: 1 },
        update: prune({ retentionDays: input.retentionDays }) as any,
        create: { id: 1, retentionDays: input.retentionDays ?? 180 },
      })) as any;
    },
    async createAuditLog(input) {
      return (await prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId ?? null,
          actorUsername: input.actorUsername,
          actorRole: input.actorRole,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          resourceLabel: input.resourceLabel ?? null,
          result: input.result,
          statusCode: input.statusCode,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          details: input.details as any,
        },
      })) as any;
    },
    async listAuditLogs(query) {
      const createdAt = prune({ gte: query.from, lte: query.to });
      const where: any = prune({
        actorUsername: query.actor ? { contains: query.actor, mode: 'insensitive' } : undefined,
        action: query.action,
        resourceType: query.resourceType,
        result: query.result,
        createdAt: Object.keys(createdAt).length ? createdAt : undefined,
        OR: query.search ? [
          { actorUsername: { contains: query.search, mode: 'insensitive' } },
          { resourceLabel: { contains: query.search, mode: 'insensitive' } },
          { resourceId: { contains: query.search, mode: 'insensitive' } },
          { ipAddress: { contains: query.search, mode: 'insensitive' } },
        ] : undefined,
      });
      const [items, total] = await prisma.$transaction([
        prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);
      return { items: items as any, total, page: query.page, pageSize: query.pageSize };
    },
    async deleteAuditLogsBefore(cutoff) {
      return (await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
    },
    async listUsers() {
      return (await prisma.user.findMany({ orderBy: { id: 'asc' } })) as any;
    },
    async initializeAdmin(input) {
      return (await prisma.$transaction(async (transaction) => {
        await transaction.$queryRawUnsafe('SELECT pg_advisory_xact_lock(1313820239)');
        const users = await transaction.user.findMany({ orderBy: { id: 'asc' } });
        const existingAdmin = users.find((user) => user.role === 'admin' && user.passwordHash);
        if (existingAdmin) throw Object.assign(new Error('Admin is already initialized'), { statusCode: 409 });

        const existing = users.find((user) => user.username === input.username) || users[0];
        if (existing) {
          return transaction.user.update({
            where: { id: existing.id },
            data: {
              username: input.username,
              email: input.email,
              displayName: input.displayName,
              passwordHash: input.passwordHash,
              role: 'admin',
            },
          });
        }
        return transaction.user.create({
          data: {
            username: input.username,
            email: input.email,
            displayName: input.displayName,
            passwordHash: input.passwordHash,
            role: 'admin',
            sites: { create: toSiteCreate(defaultSite(0, input.username)) as any },
          },
        });
      })) as any;
    },
    async findUserById(id) {
      return (await prisma.user.findUnique({ where: { id } })) as any;
    },
    async findUserByUsername(username) {
      return (await prisma.user.findUnique({ where: { username } })) as any;
    },
    async findUserByEmail(email) {
      return (await prisma.user.findUnique({ where: { email } })) as any;
    },
    async createUser(input) {
      return (await prisma.user.create({
        data: {
          username: input.username,
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          role: input.role || 'user',
          llmProvider: input.llmProvider || null,
          llmApiKey: input.llmApiKey || null,
          llmModel: input.llmModel || null,
          llmBaseUrl: input.llmBaseUrl || null,
          llmReasoningEffort: input.llmReasoningEffort || null,
          sites: { create: toSiteCreate(defaultSite(0, input.username)) as any },
        },
      })) as any;
    },
    async updateUser(id, input) {
      return (await prisma.user.update({ where: { id }, data: prune(input) as any })) as any;
    },
    async deleteUser(id) {
      await prisma.user.delete({ where: { id } });
    },
    async getSite(userId) {
      return (await prisma.site.findFirst({ where: { userId } })) as any;
    },
    async getSiteBySlug(slug) {
      return (await prisma.site.findUnique({ where: { slug }, include: { user: true } })) as any;
    },
    async updateSite(userId, input) {
      const existing = await prisma.site.findFirst({ where: { userId } });
      if (existing) return (await prisma.site.update({ where: { id: existing.id }, data: toSiteUpdate(input) as any })) as any;
      return (await prisma.site.create({ data: { ...toSiteCreate(defaultSite(userId, input.slug || `user-${userId}`)), ...toSiteUpdate(input), userId } as any })) as any;
    },
    async listFolders(userId) {
      return (await prisma.folder.findMany({ where: { userId }, orderBy: [{ sortOrder: 'desc' }, { id: 'asc' }] })) as any;
    },
    async getFolder(userId, id) {
      return (await prisma.folder.findFirst({ where: { userId, id } })) as any;
    },
    async createFolder(input) {
      return (await prisma.folder.create({ data: prune(input) as any })) as any;
    },
    async updateFolder(userId, id, input) {
      const folder = await prisma.folder.findFirstOrThrow({ where: { userId, id } });
      return (await prisma.folder.update({ where: { id: folder.id }, data: prune(input) as any })) as any;
    },
    async reorderFolders(userId, ids) {
      if (!ids.length) return;
      const owned = await prisma.folder.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
      if (owned.length !== ids.length) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
      await prisma.$transaction(ids.map((id, index) => prisma.folder.update({
        where: { id },
        data: { sortOrder: (ids.length - index) * 10 },
      })));
    },
    async deleteFolder(userId, id) {
      await trashPrismaFolders(prisma, userId, [id]);
    },
    async deleteFolders(userId, ids) {
      await trashPrismaFolders(prisma, userId, ids);
    },
    async listLinks(userId) {
      return (await prisma.link.findMany({ where: { folder: { userId } }, orderBy: [{ sortOrder: 'desc' }, { id: 'asc' }] })) as any;
    },
    async createLink(input) {
      return (await prisma.link.create({ data: prune(input) as any })) as any;
    },
    async updateLink(userId, id, input) {
      const link = await prisma.link.findFirstOrThrow({ where: { id, folder: { userId } } });
      return (await prisma.link.update({ where: { id: link.id }, data: prune(input) as any })) as any;
    },
    async updateLinkHealth(userId, updates) {
      if (!updates.length) return;
      const ids = updates.map((update) => update.id);
      const owned = await prisma.link.findMany({ where: { id: { in: ids }, folder: { userId } }, select: { id: true } });
      if (owned.length !== new Set(ids).size) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
      await prisma.$transaction(updates.map((update) => prisma.link.updateMany({
        where: { id: update.id, url: update.url, folder: { userId } },
        data: {
          healthStatus: update.status,
          healthStatusCode: update.statusCode ?? null,
          healthReason: update.reason ?? null,
          healthFinalUrl: update.finalUrl ?? null,
          healthCheckedAt: update.checkedAt,
        },
      })));
    },
    async reorderLinks(userId, ids) {
      if (!ids.length) return;
      const owned = await prisma.link.findMany({ where: { id: { in: ids }, folder: { userId } }, select: { id: true } });
      if (owned.length !== ids.length) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
      await prisma.$transaction(ids.map((id, index) => prisma.link.update({
        where: { id },
        data: { sortOrder: (ids.length - index) * 10 },
      })));
    },
    async moveLink(userId, id, targetFolderId, sourceIds, targetIds) {
      return (await prisma.$transaction(async (transaction) => {
        const link = await transaction.link.findFirst({ where: { id, folder: { userId } } });
        if (!link) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
        const targetFolder = await transaction.folder.findFirst({ where: { id: targetFolderId, userId } });
        if (!targetFolder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
        if (link.folderId === targetFolderId) throw Object.assign(new Error('Bookmark already belongs to target folder'), { statusCode: 400 });

        const [sourceLinks, targetLinks] = await Promise.all([
          transaction.link.findMany({ where: { folderId: link.folderId, id: { not: id } }, select: { id: true } }),
          transaction.link.findMany({ where: { folderId: targetFolderId }, select: { id: true } }),
        ]);
        assertExactIds(sourceIds, sourceLinks.map((item) => item.id));
        assertExactIds(targetIds, [...targetLinks.map((item) => item.id), id]);

        await transaction.link.update({ where: { id }, data: { folderId: targetFolderId } });
        await Promise.all([
          ...sourceIds.map((linkId, index) => transaction.link.update({
            where: { id: linkId },
            data: { sortOrder: (sourceIds.length - index) * 10 },
          })),
          ...targetIds.map((linkId, index) => transaction.link.update({
            where: { id: linkId },
            data: { sortOrder: (targetIds.length - index) * 10 },
          })),
        ]);
        return transaction.link.findUniqueOrThrow({ where: { id } });
      })) as any;
    },
    async deleteLink(userId, id) {
      await trashPrismaLinks(prisma, userId, [id]);
    },
    async deleteLinks(userId, ids) {
      await trashPrismaLinks(prisma, userId, ids);
    },
    async listTrashItems(userId) {
      return (await prisma.trashItem.findMany({ where: { userId }, orderBy: { deletedAt: 'desc' } })) as any;
    },
    async restoreTrashItem(userId, id) {
      return (await prisma.$transaction(async (transaction) => {
        const item = await transaction.trashItem.findFirst({ where: { id, userId } });
        if (!item) throw Object.assign(new Error('Trash item not found'), { statusCode: 404 });
        const payload = item.payload as Record<string, unknown>;
        if (item.kind === 'bookmark') {
          const link = revivePrismaLink(payload.link);
          const folder = await transaction.folder.findFirst({ where: { id: link.folderId, userId } });
          if (!folder) throw Object.assign(new Error('Restore the original folder first'), { statusCode: 409 });
          if (await transaction.link.findUnique({ where: { id: link.id } })) throw Object.assign(new Error('Bookmark already exists'), { statusCode: 409 });
          await transaction.link.create({ data: link as any });
        } else {
          const folders = revivePrismaFolders(payload.folders);
          const links = revivePrismaLinks(payload.links);
          const root = folders.find((folder) => folder.id === item.entityId);
          if (!root) throw Object.assign(new Error('Invalid trash snapshot'), { statusCode: 409 });
          if (root.parentId) {
            const parent = await transaction.folder.findFirst({ where: { id: root.parentId, userId } });
            if (!parent) throw Object.assign(new Error('Restore the parent NoTab first'), { statusCode: 409 });
          }
          const [folderConflicts, linkConflicts] = await Promise.all([
            transaction.folder.count({ where: { id: { in: folders.map((folder) => folder.id) } } }),
            transaction.link.count({ where: { id: { in: links.map((link) => link.id) } } }),
          ]);
          if (folderConflicts) throw Object.assign(new Error('Folder already exists'), { statusCode: 409 });
          if (linkConflicts) throw Object.assign(new Error('Bookmark already exists'), { statusCode: 409 });
          for (const folder of orderFoldersForRestore(folders)) {
            await transaction.folder.create({ data: folder as any });
          }
          if (links.length) await transaction.link.createMany({ data: links as any });
        }
        await transaction.trashItem.delete({ where: { id: item.id } });
        return item;
      })) as any;
    },
    async permanentlyDeleteTrashItem(userId, id) {
      const deleted = await prisma.trashItem.deleteMany({ where: { id, userId } });
      if (!deleted.count) throw Object.assign(new Error('Trash item not found'), { statusCode: 404 });
    },
    async emptyTrash(userId) {
      return (await prisma.trashItem.deleteMany({ where: { userId } })).count;
    },
    async listTokens(userId) {
      return (await prisma.apiToken.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })) as any;
    },
    async createToken(userId, name, expiresAt, scopes = []) {
      const token = generateApiToken();
      const record = await prisma.apiToken.create({
        data: { userId, name, tokenHash: hashApiToken(token), tokenPrefix: token.slice(0, 10), expiresAt, scopes },
      });
      return { ...record, token } as any;
    },
    async findToken(token) {
      return (await prisma.apiToken.findFirst({
        where: { tokenHash: hashApiToken(token), OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        include: { user: true },
      })) as any;
    },
    async deleteToken(userId, id) {
      await prisma.apiToken.deleteMany({ where: { userId, id } });
    },
    async createSession(userId, input) {
      const token = generateSessionToken();
      const record = await prisma.authSession.create({
        data: {
          userId,
          tokenHash: hashSessionToken(token),
          userAgent: input.userAgent || null,
          ipAddress: input.ipAddress || null,
          expiresAt: input.expiresAt,
        },
      });
      return { ...record, token } as any;
    },
    async findSession(token) {
      return (await prisma.authSession.findFirst({
        where: { tokenHash: hashSessionToken(token), expiresAt: { gt: new Date() } },
        include: { user: true },
      })) as any;
    },
    async listSessions(userId) {
      return (await prisma.authSession.findMany({
        where: { userId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })) as any;
    },
    async touchSession(id) {
      await prisma.authSession.updateMany({
        where: { id, lastSeenAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
        data: { lastSeenAt: new Date() },
      });
    },
    async deleteSession(userId, id) {
      await prisma.authSession.deleteMany({ where: { userId, id } });
    },
    async deleteOtherSessions(userId, currentId) {
      await prisma.authSession.deleteMany({
        where: { userId, ...(currentId ? { id: { not: currentId } } : {}) },
      });
    },
    async listPasskeys(userId) {
      return (await prisma.passkeyCredential.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })).map((row) => ({ ...row, transports: Array.isArray(row.transports) ? row.transports : [] })) as any;
    },
    async findPasskey(id) {
      const row = await prisma.passkeyCredential.findUnique({ where: { id }, include: { user: true } });
      return row ? { ...row, transports: Array.isArray(row.transports) ? row.transports : [] } as any : null;
    },
    async createPasskey(input) {
      const row = await prisma.passkeyCredential.create({
        data: {
          id: input.id,
          userId: input.userId,
          name: input.name,
          publicKey: Buffer.from(input.publicKey),
          counter: input.counter,
          transports: input.transports,
          deviceType: input.deviceType,
          backedUp: input.backedUp,
        },
      });
      return { ...row, transports: Array.isArray(row.transports) ? row.transports : [] } as any;
    },
    async updatePasskeyCounter(userId, id, counter) {
      await prisma.passkeyCredential.updateMany({
        where: { userId, id },
        data: { counter, lastUsedAt: new Date() },
      });
    },
    async deletePasskey(userId, id) {
      await prisma.passkeyCredential.deleteMany({ where: { userId, id } });
    },
    async createWebAuthnChallenge(input) {
      return (await prisma.webAuthnChallenge.create({ data: input })) as any;
    },
    async consumeWebAuthnChallenge(id, type, userId) {
      const challenge = await prisma.webAuthnChallenge.findFirst({
        where: { id, type, userId, expiresAt: { gt: new Date() } },
      });
      if (!challenge) return null;
      const deleted = await prisma.webAuthnChallenge.deleteMany({ where: { id: challenge.id } });
      return deleted.count === 1 ? challenge as any : null;
    },
  };
}

function toSiteCreate(site: SiteRecord) {
  return {
    name: site.name,
    description: site.description,
    slug: site.slug,
    backgroundImage: site.backgroundImage,
    backgroundColor: site.backgroundColor,
    fontColor: site.fontColor,
    searchUrlTemplate: site.searchUrlTemplate,
    localSearchFirst: site.localSearchFirst,
    guestAccessEnabled: site.guestAccessEnabled,
    guestAccessPasswordHash: site.guestAccessPasswordHash,
    settings: site.settings as any,
  };
}

function toSiteUpdate(input: Partial<SiteRecord>) {
  return prune({
    name: input.name,
    description: input.description,
    slug: input.slug,
    backgroundImage: input.backgroundImage,
    backgroundColor: input.backgroundColor,
    fontColor: input.fontColor,
    searchUrlTemplate: input.searchUrlTemplate,
    localSearchFirst: input.localSearchFirst,
    guestAccessEnabled: input.guestAccessEnabled,
    guestAccessPasswordHash: input.guestAccessPasswordHash,
    settings: input.settings,
  });
}

function prune<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

async function trashPrismaFolders(prisma: PrismaClient, userId: number, requestedIds: number[]) {
  if (!requestedIds.length) return;
  await prisma.$transaction(async (transaction) => {
    const folders = await transaction.folder.findMany({ where: { userId } });
    const roots = topLevelPrismaFolderIds(folders, requestedIds);
    for (const rootId of roots) {
      const root = folders.find((folder) => folder.id === rootId);
      if (!root) continue;
      const folderIds = collectPrismaFolderIds(folders, rootId);
      const links = await transaction.link.findMany({ where: { folderId: { in: folderIds } } });
      await transaction.trashItem.create({
        data: {
          userId,
          kind: root.parentId ? 'folder' : 'notab',
          entityId: root.id,
          label: root.name,
          payload: serializeTrashPayload({ folders: folders.filter((folder) => folderIds.includes(folder.id)), links }),
        },
      });
    }
    if (roots.length) await transaction.folder.deleteMany({ where: { userId, id: { in: roots } } });
  });
}

async function trashPrismaLinks(prisma: PrismaClient, userId: number, requestedIds: number[]) {
  if (!requestedIds.length) return;
  await prisma.$transaction(async (transaction) => {
    const links = await transaction.link.findMany({ where: { id: { in: requestedIds }, folder: { userId } } });
    if (requestedIds.length === 1 && !links.length) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    if (links.length) {
      // 单条 createMany 代替逐行 create，事务内的往返次数从 N 降到 1，
      // 避免大批量删除撞上 Prisma 交互式事务默认 5s 的超时。
      await transaction.trashItem.createMany({
        data: links.map((link) => ({
          userId,
          kind: 'bookmark',
          entityId: link.id,
          label: link.name,
          payload: serializeTrashPayload({ link }),
        })),
      });
      await transaction.link.deleteMany({ where: { id: { in: links.map((link) => link.id) } } });
    }
  });
}

function topLevelPrismaFolderIds(folders: Array<{ id: number; parentId: number | null }>, requestedIds: number[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const selected = new Set(requestedIds.filter((id) => byId.has(id)));
  return [...selected].filter((id) => {
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId) {
      if (selected.has(parentId)) return false;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

function collectPrismaFolderIds(folders: Array<{ id: number; parentId: number | null }>, rootId: number) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return [...ids];
}

function serializeTrashPayload(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function revivePrismaFolders(value: unknown) {
  if (!Array.isArray(value)) throw Object.assign(new Error('Invalid trash snapshot'), { statusCode: 409 });
  return value.map((folder) => ({
    ...(folder as Record<string, unknown>),
    createdAt: new Date(String((folder as Record<string, unknown>).createdAt)),
    updatedAt: new Date(String((folder as Record<string, unknown>).updatedAt)),
  })) as Array<{ id: number; userId: number; parentId: number | null; createdAt: Date; updatedAt: Date }>;
}

function revivePrismaLinks(value: unknown) {
  if (!Array.isArray(value)) throw Object.assign(new Error('Invalid trash snapshot'), { statusCode: 409 });
  return value.map(revivePrismaLink);
}

function revivePrismaLink(value: unknown) {
  if (!value || typeof value !== 'object') throw Object.assign(new Error('Invalid trash snapshot'), { statusCode: 409 });
  const link = value as Record<string, unknown>;
  return {
    ...link,
    id: Number(link.id),
    folderId: Number(link.folderId),
    createdAt: new Date(String(link.createdAt)),
    updatedAt: new Date(String(link.updatedAt)),
    healthCheckedAt: link.healthCheckedAt ? new Date(String(link.healthCheckedAt)) : null,
  };
}

function orderFoldersForRestore<T extends { id: number; parentId: number | null }>(folders: T[]) {
  const pending = [...folders];
  const ordered: T[] = [];
  const ids = new Set(folders.map((folder) => folder.id));
  while (pending.length) {
    const index = pending.findIndex((folder) => !folder.parentId || !ids.has(folder.parentId) || ordered.some((item) => item.id === folder.parentId));
    if (index < 0) throw Object.assign(new Error('Invalid folder hierarchy in trash'), { statusCode: 409 });
    ordered.push(pending.splice(index, 1)[0]);
  }
  return ordered;
}

function assertExactIds(actual: number[], expected: number[]) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) {
    throw Object.assign(new Error('Bookmark order changed; reload and try again'), { statusCode: 409 });
  }
  const expectedIds = new Set(expected);
  if (actual.some((id) => !expectedIds.has(id))) {
    throw Object.assign(new Error('Bookmark order changed; reload and try again'), { statusCode: 409 });
  }
}
