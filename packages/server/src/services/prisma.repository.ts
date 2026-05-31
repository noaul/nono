import { PrismaClient } from '@prisma/client';
import type { Repository, SiteRecord } from './repository.js';
import { defaultSite } from './repository.js';

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
    async deleteFolder(userId, id) {
      const folder = await prisma.folder.findFirstOrThrow({ where: { userId, id } });
      await prisma.folder.delete({ where: { id: folder.id } });
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
    async deleteLink(userId, id) {
      const link = await prisma.link.findFirstOrThrow({ where: { id, folder: { userId } } });
      await prisma.link.delete({ where: { id: link.id } });
    },
    async listTokens(userId) {
      return (await prisma.apiToken.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })) as any;
    },
    async createToken(userId, name, expiresAt) {
      const { generateApiToken } = await import('../utils/crypto.js');
      return (await prisma.apiToken.create({ data: { userId, name, token: generateApiToken(), expiresAt } })) as any;
    },
    async findToken(token) {
      return (await prisma.apiToken.findFirst({ where: { token, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, include: { user: true } })) as any;
    },
    async deleteToken(userId, id) {
      await prisma.apiToken.deleteMany({ where: { userId, id } });
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
