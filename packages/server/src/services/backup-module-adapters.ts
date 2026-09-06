import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AppServices } from '../types.js';
import { exportNoStarData, importNoStarData } from '../routes/nostar/sync-service.js';
import { removeBackupDirectory, runBackupCommand, type BackupCommandRunner } from './backup.service.js';
import type { BackupModule, BackupModuleAdapter } from './backup-center.service.js';

const NONO_KIND = 'nono.core-backup';
const NOSTAR_KIND = 'nono.nostar-backup';
const PRODUCT_KIND = 'nono.product-backup';
const MAX_NODESK_ARCHIVE_ENTRIES = 10_000;
const MAX_NODESK_EXPANDED_BYTES = 512 * 1024 * 1024;

export function createBackupModuleAdapters(options: {
  prisma: PrismaClient;
  encryptionKey: string;
  nodeskContentDir: string;
  internalToken?: string;
  noMoneyPort?: number;
  yumiPort?: number;
  fetch?: typeof fetch;
  run?: BackupCommandRunner;
  now?: () => Date;
}): Record<BackupModule, BackupModuleAdapter> {
  const request = options.fetch || fetch;
  const run = options.run || runBackupCommand;
  const now = options.now || (() => new Date());
  return {
    nono: createNonoAdapter(options.prisma, now),
    nodesk: createNoDeskAdapter(options.nodeskContentDir, run),
    nostar: createNoStarAdapter(options.prisma, options.encryptionKey, now),
    nomoney: createProductAdapter('nomoney', options.noMoneyPort || Number(process.env.NOMONEY_INTERNAL_PORT || 2030), options.internalToken ?? process.env.NOMONEY_INTERNAL_TOKEN ?? '', request, now),
    yumi: createProductAdapter('yumi', options.yumiPort || Number(process.env.YUMI_INTERNAL_PORT || 2040), options.internalToken ?? process.env.NOMONEY_INTERNAL_TOKEN ?? '', request, now),
  };
}

function createNonoAdapter(prisma: PrismaClient, now: () => Date): BackupModuleAdapter {
  return {
    module: 'nono',
    extension: 'json',
    contentType: 'application/json',
    async export(userId) {
      const [user, sites, folders, links] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
        prisma.site.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
        prisma.folder.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
        prisma.link.findMany({ where: { folder: { userId } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      ]);
      if (!user) throw httpError(404, 'Nono user not found');
      return jsonBuffer({
        kind: NONO_KIND,
        version: 1,
        module: 'nono',
        exportedAt: now().toISOString(),
        user,
        sites: sites.map(stripRecordMetadata),
        folders: folders.map(stripRecordMetadata),
        links: links.map(stripRecordMetadata),
      });
    },
    async validate(body) {
      parseNonoBackup(body);
    },
    async restore(userId, body) {
      const backup = parseNonoBackup(body);
      await prisma.$transaction(async (transaction) => {
        await transaction.link.deleteMany({ where: { folder: { userId } } });
        await transaction.folder.deleteMany({ where: { userId } });
        await transaction.site.deleteMany({ where: { userId } });
        if (backup.user && typeof backup.user.displayName === 'string') {
          await transaction.user.update({ where: { id: userId }, data: { displayName: backup.user.displayName } });
        }
        for (const raw of backup.sites) {
          const site = record(raw);
          await transaction.site.create({ data: {
            userId,
            name: text(site.name),
            description: text(site.description),
            slug: text(site.slug),
            backgroundImage: nullableText(site.backgroundImage),
            backgroundColor: text(site.backgroundColor) || '#000000',
            fontColor: text(site.fontColor) || '#ffffff',
            searchUrlTemplate: text(site.searchUrlTemplate) || 'https://www.google.com/search?q={query}',
            localSearchFirst: site.localSearchFirst !== false,
            guestAccessEnabled: Boolean(site.guestAccessEnabled),
            guestAccessPasswordHash: nullableText(site.guestAccessPasswordHash),
            settings: (site.settings && typeof site.settings === 'object' ? site.settings : {}) as never,
          } });
        }

        const folderIds = new Map<number, number>();
        let pending = backup.folders.map(record);
        while (pending.length) {
          const ready = pending.filter((folder) => folder.parentId == null || folderIds.has(Number(folder.parentId)));
          if (!ready.length) throw httpError(400, 'Nono folder hierarchy is invalid');
          for (const folder of ready) {
            const created = await transaction.folder.create({ data: {
              userId,
              parentId: folder.parentId == null ? null : folderIds.get(Number(folder.parentId))!,
              name: text(folder.name),
              icon: nullableText(folder.icon),
              description: nullableText(folder.description),
              sortOrder: integer(folder.sortOrder),
              passwordHash: nullableText(folder.passwordHash),
              passwordHint: nullableText(folder.passwordHint),
            } });
            folderIds.set(Number(folder.id), created.id);
          }
          const readyIds = new Set(ready.map((folder) => folder.id));
          pending = pending.filter((folder) => !readyIds.has(folder.id));
        }
        for (const raw of backup.links) {
          const link = record(raw);
          const folderId = folderIds.get(Number(link.folderId));
          if (!folderId) throw httpError(400, 'Nono link references an unknown folder');
          await transaction.link.create({ data: {
            folderId,
            name: text(link.name),
            url: text(link.url),
            icon: nullableText(link.icon),
            description: nullableText(link.description),
            sortOrder: integer(link.sortOrder),
            healthCheckEnabled: link.healthCheckEnabled !== false,
            healthStatus: nullableText(link.healthStatus),
            healthStatusCode: link.healthStatusCode == null ? null : integer(link.healthStatusCode),
            healthReason: nullableText(link.healthReason),
            healthFinalUrl: nullableText(link.healthFinalUrl),
            healthCheckedAt: dateOrNull(link.healthCheckedAt),
            clickCount: integer(link.clickCount),
            lastClickedAt: dateOrNull(link.lastClickedAt),
          } });
        }
      });
    },
  };
}

function createNoStarAdapter(prisma: PrismaClient, encryptionKey: string, now: () => Date): BackupModuleAdapter {
  const services = { prisma, encryptionKey } as AppServices;
  return {
    module: 'nostar',
    extension: 'json',
    contentType: 'application/json',
    async export(userId) {
      const [data, account, aiProfiles, webdavProfiles, embeddingProfiles, vectorConfig, settings] = await Promise.all([
        exportNoStarData(services, userId),
        prisma.noStarAccount.findUnique({ where: { userId } }),
        prisma.noStarAiProfile.findMany({ where: { userId }, select: { legacyId: true, apiKeyEncrypted: true } }),
        prisma.noStarWebDavConfig.findMany({ where: { userId }, select: { legacyId: true, passwordEncrypted: true } }),
        prisma.noStarEmbeddingConfig.findMany({ where: { userId }, select: { legacyId: true, apiKeyEncrypted: true } }),
        prisma.noStarVectorSearchConfig.findUnique({ where: { userId }, select: { authTokenEncrypted: true } }),
        prisma.noStarSetting.findMany({ where: { userId }, select: { key: true, value: true } }),
      ]);
      return jsonBuffer({
        kind: NOSTAR_KIND,
        version: 1,
        module: 'nostar',
        exportedAt: now().toISOString(),
        data,
        protected: {
          account: account ? {
            githubLogin: account.githubLogin,
            githubName: account.githubName,
            githubAvatarUrl: account.githubAvatarUrl,
            githubTokenEncrypted: account.githubTokenEncrypted,
            lastSyncAt: account.lastSyncAt?.toISOString() || null,
          } : null,
          aiProfiles,
          webdavProfiles,
          embeddingProfiles,
          vectorConfig,
          settings,
        },
      });
    },
    async validate(body) {
      parseNoStarBackup(body);
    },
    async restore(userId, body) {
      const backup = parseNoStarBackup(body);
      await prisma.noStarRelease.deleteMany({ where: { userId } });
      await prisma.noStarRepository.deleteMany({ where: { userId } });
      await prisma.noStarVectorSearchConfig.deleteMany({ where: { userId } });
      await prisma.noStarEmbeddingConfig.deleteMany({ where: { userId } });
      await prisma.noStarAiProfile.deleteMany({ where: { userId } });
      await prisma.noStarWebDavConfig.deleteMany({ where: { userId } });
      await prisma.noStarAssetFilter.deleteMany({ where: { userId } });
      await prisma.noStarCategory.deleteMany({ where: { userId } });
      await prisma.noStarSetting.deleteMany({ where: { userId } });
      await prisma.noStarAccount.deleteMany({ where: { userId } });
      await importNoStarData(services, userId, record(backup.data));

      const protectedData = record(backup.protected);
      for (const profile of array(protectedData.aiProfiles)) {
        const value = record(profile);
        await prisma.noStarAiProfile.updateMany({ where: { userId, legacyId: text(value.legacyId) }, data: { apiKeyEncrypted: nullableText(value.apiKeyEncrypted) } });
      }
      for (const profile of array(protectedData.webdavProfiles)) {
        const value = record(profile);
        await prisma.noStarWebDavConfig.updateMany({ where: { userId, legacyId: text(value.legacyId) }, data: { passwordEncrypted: nullableText(value.passwordEncrypted) } });
      }
      for (const profile of array(protectedData.embeddingProfiles)) {
        const value = record(profile);
        await prisma.noStarEmbeddingConfig.updateMany({ where: { userId, legacyId: text(value.legacyId) }, data: { apiKeyEncrypted: nullableText(value.apiKeyEncrypted) } });
      }
      const vector = record(protectedData.vectorConfig);
      if (Object.keys(vector).length) {
        await prisma.noStarVectorSearchConfig.updateMany({ where: { userId }, data: { authTokenEncrypted: nullableText(vector.authTokenEncrypted) } });
      }
      for (const setting of array(protectedData.settings)) {
        const value = record(setting);
        const key = text(value.key);
        if (!key) continue;
        await prisma.noStarSetting.upsert({ where: { userId_key: { userId, key } }, update: { value: value.value as never }, create: { userId, key, value: value.value as never } });
      }
      const account = record(protectedData.account);
      if (Object.keys(account).length) {
        const accountData = {
          githubLogin: nullableText(account.githubLogin),
          githubName: nullableText(account.githubName),
          githubAvatarUrl: nullableText(account.githubAvatarUrl),
          githubTokenEncrypted: nullableText(account.githubTokenEncrypted),
          lastSyncAt: dateOrNull(account.lastSyncAt),
        };
        await prisma.noStarAccount.upsert({ where: { userId }, update: accountData, create: { userId, ...accountData } });
      }
    },
  };
}

function createNoDeskAdapter(contentDir: string, run: BackupCommandRunner): BackupModuleAdapter {
  async function withArchive<T>(body: Buffer | null, action: (archivePath: string, workspace: string) => Promise<T>) {
    const workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nono-nodesk-backup-'));
    const archivePath = path.join(workspace, 'nodesk.tar.gz');
    try {
      if (body) await fs.promises.writeFile(archivePath, body);
      return await action(archivePath, workspace);
    } finally {
      await removeBackupDirectory(workspace);
    }
  }

  async function validateArchive(archivePath: string) {
    const listing = await run('tar', ['-tzf', archivePath]);
    const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
    if (entries.length > MAX_NODESK_ARCHIVE_ENTRIES) {
      throw httpError(409, 'NoDesk backup contains too many entries');
    }
    for (const rawEntry of entries) {
      if (rawEntry === '.' || rawEntry === './') continue;
      const entry = rawEntry.replace(/^\.\//, '');
      if (!entry || path.posix.isAbsolute(entry) || /^[a-z]:/i.test(entry) || entry.split('/').includes('..')) {
        throw httpError(409, 'NoDesk backup contains an unsafe path');
      }
    }

    const verbose = await run('tar', ['-tvzf', archivePath]);
    let expandedBytes = 0;
    for (const line of verbose.stdout.split(/\r?\n/).filter(Boolean)) {
      const type = line.trimStart().charAt(0);
      if (type !== '-' && type !== 'd') {
        throw httpError(409, 'NoDesk backup contains an unsupported entry type');
      }
      if (type === '-') expandedBytes += archiveEntrySize(line);
      if (expandedBytes > MAX_NODESK_EXPANDED_BYTES) {
        throw httpError(409, 'NoDesk backup expanded size exceeds the limit');
      }
    }
  }

  return {
    module: 'nodesk',
    extension: 'tar.gz',
    contentType: 'application/gzip',
    async export() {
      if (!fs.existsSync(contentDir)) throw httpError(503, 'NoDesk content directory is unavailable');
      return withArchive(null, async (archivePath) => {
        await run('tar', ['-czf', archivePath, '-C', contentDir, '.']);
        await validateArchive(archivePath);
        return fs.promises.readFile(archivePath);
      });
    },
    async validate(body) {
      if (!body.length) throw httpError(400, 'NoDesk backup is empty');
      await withArchive(body, async (archivePath) => validateArchive(archivePath));
    },
    async restore(_userId, body) {
      await withArchive(body, async (archivePath, workspace) => {
        await validateArchive(archivePath);
        const extracted = path.join(workspace, 'content');
        await fs.promises.mkdir(extracted, { recursive: true });
        await run('tar', ['-xzf', archivePath, '-C', extracted]);
        const parent = path.dirname(contentDir);
        const previous = path.join(parent, `.nodesk-previous-${process.pid}-${randomBytes(3).toString('hex')}`);
        let movedCurrent = false;
        try {
          if (fs.existsSync(contentDir)) {
            await fs.promises.rename(contentDir, previous);
            movedCurrent = true;
          }
          await fs.promises.rename(extracted, contentDir);
          if (movedCurrent) await removeBackupDirectory(previous);
        } catch (error) {
          if (!fs.existsSync(contentDir) && movedCurrent && fs.existsSync(previous)) await fs.promises.rename(previous, contentDir);
          throw error;
        }
      });
    },
  };
}

function archiveEntrySize(line: string) {
  const gnu = line.match(/^\S+\s+\S+\s+(\d+)\s+/);
  if (gnu) return Number(gnu[1]);
  const bsd = line.match(/^\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+/);
  if (bsd) return Number(bsd[1]);
  throw httpError(409, 'NoDesk backup metadata is invalid');
}

function createProductAdapter(
  module: 'nomoney' | 'yumi',
  port: number,
  internalToken: string,
  request: typeof fetch,
  now: () => Date,
): BackupModuleAdapter {
  const label = module === 'nomoney' ? 'NoMoney' : 'Yumi';
  async function internal(pathname: string, init: RequestInit) {
    if (!internalToken) throw httpError(503, `${label} internal backup authentication is not configured`);
    const response = await request(`http://127.0.0.1:${port}/api/internal/backup${pathname}`, {
      ...init,
      headers: {
        'x-nono-internal-token': internalToken,
        ...(init.headers || {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    }).catch(() => {
      throw httpError(502, `${label} backup service is unavailable`);
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw httpError(response.status, `${label} backup service rejected the request`);
    return payload;
  }
  return {
    module,
    extension: 'json',
    contentType: 'application/json',
    async export() {
      const payload = await internal('', { method: 'GET' });
      return jsonBuffer({ kind: PRODUCT_KIND, version: 1, module, exportedAt: now().toISOString(), payload });
    },
    async validate(body) {
      parseProductBackup(body, module, label);
    },
    async restore(_userId, body) {
      const backup = parseProductBackup(body, module, label);
      await internal('/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(backup.payload),
      });
    },
  };
}

function parseNonoBackup(body: Buffer) {
  const value = parseJsonDocument(body, 'Nono backup');
  if (value.kind !== NONO_KIND || value.version !== 1 || value.module !== 'nono' || !Array.isArray(value.sites) || !Array.isArray(value.folders) || !Array.isArray(value.links)) {
    throw httpError(400, 'Nono backup is invalid');
  }
  return value as Record<string, unknown> & { user?: Record<string, unknown>; sites: unknown[]; folders: unknown[]; links: unknown[] };
}

function parseNoStarBackup(body: Buffer) {
  const value = parseJsonDocument(body, 'NoStar backup');
  if (value.kind !== NOSTAR_KIND || value.version !== 1 || value.module !== 'nostar' || !value.data || typeof value.data !== 'object') {
    throw httpError(400, 'NoStar backup is invalid');
  }
  return value;
}

function parseProductBackup(body: Buffer, module: 'nomoney' | 'yumi', label: string) {
  const value = parseJsonDocument(body, `${label} backup`);
  const payload = record(value.payload);
  if (value.kind !== PRODUCT_KIND || value.version !== 1 || value.module !== module || payload.product !== module || payload.version !== 2) {
    throw httpError(400, `${label} backup is invalid`);
  }
  return { ...value, payload };
}

function parseJsonDocument(body: Buffer, label: string): Record<string, unknown> {
  try {
    const value = JSON.parse(body.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw httpError(400, `${label} is invalid`);
  }
}

function stripRecordMetadata(value: Record<string, unknown>) {
  const { userId: _userId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = value;
  return rest;
}

function jsonBuffer(value: unknown) {
  return Buffer.from(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2));
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function nullableText(value: unknown) {
  const result = text(value);
  return result || null;
}

function integer(value: unknown) {
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : 0;
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
