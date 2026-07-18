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
      await prisma.folder.deleteMany({ where: { userId, id } });
    },
    async deleteFolders(userId, ids) {
      if (!ids.length) return;
      await prisma.folder.deleteMany({ where: { userId, id: { in: ids } } });
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
    async deleteLink(userId, id) {
      const link = await prisma.link.findFirstOrThrow({ where: { id, folder: { userId } } });
      await prisma.link.delete({ where: { id: link.id } });
    },
    async deleteLinks(userId, ids) {
      if (!ids.length) return;
      await prisma.link.deleteMany({ where: { id: { in: ids }, folder: { userId } } });
    },
    async listTokens(userId) {
      return (await prisma.apiToken.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })) as any;
    },
    async createToken(userId, name, expiresAt) {
      const token = generateApiToken();
      const record = await prisma.apiToken.create({
        data: { userId, name, tokenHash: hashApiToken(token), tokenPrefix: token.slice(0, 10), expiresAt },
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
    settings: input.settings,
  });
}

function prune<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
