import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../utils/crypto.js';

type Row = Record<string, any>;

export interface MigrationArgs {
  sqlitePath: string;
  username: string;
  sourceKey?: string;
  dryRun: boolean;
}

export function parseMigrationArgs(argv: string[]): MigrationArgs {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : '';
  };
  const sqlitePath = value('--sqlite');
  const username = value('--username');
  if (!sqlitePath || !username) {
    throw new Error('Usage: npm run migrate:nostar -- --sqlite <data.db> --username <nono-user> [--source-key <64-hex>] [--dry-run]');
  }
  return {
    sqlitePath: path.resolve(sqlitePath),
    username,
    sourceKey: value('--source-key') || undefined,
    dryRun: argv.includes('--dry-run'),
  };
}

export function decryptLegacySecret(value: string, keyHex: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error('Legacy encryption key must be 64 hexadecimal characters');
  const [ivRaw, encryptedRaw, tagRaw] = value.split(':');
  if (!ivRaw || !encryptedRaw || !tagRaw) throw new Error('Invalid legacy encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}

export async function migrateNoStarSqlite(args: MigrationArgs, prisma = new PrismaClient()) {
  if (!fs.existsSync(args.sqlitePath)) throw new Error(`SQLite database not found: ${args.sqlitePath}`);
  const targetKey = process.env.ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(targetKey)) throw new Error('ENCRYPTION_KEY must be configured with 64 hexadecimal characters');
  const sourceKey = resolveSourceKey(args);
  const user = await prisma.user.findUnique({ where: { username: args.username } });
  if (!user) throw new Error(`Nono user not found: ${args.username}`);

  const db = new DatabaseSync(args.sqlitePath, { readOnly: true });
  try {
    const source = {
      repositories: readTable(db, 'repositories'),
      releases: readTable(db, 'releases'),
      categories: readTable(db, 'categories'),
      aiConfigs: readTable(db, 'ai_configs'),
      webdavConfigs: readTable(db, 'webdav_configs'),
      assetFilters: readTable(db, 'asset_filters'),
      settings: readTable(db, 'settings'),
      embeddingConfigs: readTable(db, 'embedding_configs'),
      vectorConfigs: readTable(db, 'vector_search_configs'),
    };
    const sourceCounts = Object.fromEntries(Object.entries(source).map(([key, rows]) => [key, rows.length]));
    if (args.dryRun) return { dryRun: true, userId: user.id, sourceCounts };

    const backupPath = `${args.sqlitePath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(args.sqlitePath, backupPath, fs.constants.COPYFILE_EXCL);
    const counts: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
      const repositoryIds = new Map<string, number>();
      for (const row of source.repositories) {
        const githubId = BigInt(String(row.id));
        const repository = await tx.noStarRepository.upsert({
          where: { userId_githubId: { userId: user.id, githubId } },
          update: repositoryData(row),
          create: { userId: user.id, githubId, ...repositoryData(row) },
        });
        repositoryIds.set(String(row.id), repository.id);
        if (row.full_name) repositoryIds.set(String(row.full_name), repository.id);
      }
      counts.repositories = source.repositories.length;

      let releaseCount = 0;
      for (const row of source.releases) {
        const repositoryId = repositoryIds.get(String(row.repo_id)) || repositoryIds.get(String(row.repo_full_name));
        if (!repositoryId || row.id === null || row.id === undefined) continue;
        const githubId = BigInt(String(row.id));
        await tx.noStarRelease.upsert({
          where: { userId_githubId: { userId: user.id, githubId } },
          update: releaseData(row, repositoryId),
          create: { userId: user.id, githubId, ...releaseData(row, repositoryId) },
        });
        releaseCount += 1;
      }
      counts.releases = releaseCount;

      for (const row of source.categories) {
        const legacyId = String(row.id);
        const data = {
          name: String(row.name || ''),
          description: nullable(row.description),
          icon: String(row.icon || 'folder'),
          keywords: jsonArray(row.keywords),
          color: nullable(row.color),
          sortOrder: integer(row.sort_order),
          isCustom: boolean(row.is_custom),
        };
        await tx.noStarCategory.upsert({
          where: { userId_legacyId: { userId: user.id, legacyId } },
          update: data,
          create: { userId: user.id, legacyId, ...data },
        });
      }
      counts.categories = source.categories.length;

      for (const row of source.aiConfigs) {
        const legacyId = String(row.id);
        const secret = reencrypt(row.api_key_encrypted, sourceKey, targetKey);
        const data = {
          name: String(row.name || ''),
          apiType: String(row.api_type || 'openai'),
          baseUrl: String(row.base_url || ''),
          apiKeyEncrypted: secret,
          model: String(row.model || ''),
          isActive: boolean(row.is_active),
          customPrompt: nullable(row.custom_prompt),
          useCustomPrompt: boolean(row.use_custom_prompt),
          concurrency: Math.max(1, integer(row.concurrency, 1)),
          reasoningEffort: nullable(row.reasoning_effort),
          mimoPlan: nullable(row.mimo_plan),
        };
        await tx.noStarAiProfile.upsert({
          where: { userId_legacyId: { userId: user.id, legacyId } },
          update: data,
          create: { userId: user.id, legacyId, ...data },
        });
      }
      counts.aiConfigs = source.aiConfigs.length;

      for (const row of source.webdavConfigs) {
        const legacyId = String(row.id);
        const data = {
          name: String(row.name || ''),
          url: String(row.url || ''),
          username: String(row.username || ''),
          passwordEncrypted: reencrypt(row.password_encrypted, sourceKey, targetKey),
          path: String(row.path || '/'),
          isActive: boolean(row.is_active),
        };
        await tx.noStarWebDavConfig.upsert({
          where: { userId_legacyId: { userId: user.id, legacyId } },
          update: data,
          create: { userId: user.id, legacyId, ...data },
        });
      }
      counts.webdavConfigs = source.webdavConfigs.length;

      for (const row of source.assetFilters) {
        const legacyId = String(row.id);
        const data = {
          name: String(row.name || ''),
          description: nullable(row.description),
          keywords: jsonArray(row.keywords),
          platform: nullable(row.platform),
          sortOrder: integer(row.sort_order),
        };
        await tx.noStarAssetFilter.upsert({
          where: { userId_legacyId: { userId: user.id, legacyId } },
          update: data,
          create: { userId: user.id, legacyId, ...data },
        });
      }
      counts.assetFilters = source.assetFilters.length;

      const embeddingIds = new Map<string, string>();
      for (const row of source.embeddingConfigs) {
        const legacyId = String(row.id);
        const data = {
          name: String(row.name || ''),
          apiType: String(row.api_type || 'openai'),
          baseUrl: String(row.base_url || ''),
          apiKeyEncrypted: reencrypt(row.api_key_encrypted, sourceKey, targetKey),
          model: String(row.model || ''),
          dimensions: integer(row.dimensions, 1536),
          isActive: boolean(row.is_active),
        };
        const embedding = await tx.noStarEmbeddingConfig.upsert({
          where: { userId_legacyId: { userId: user.id, legacyId } },
          update: data,
          create: { userId: user.id, legacyId, ...data },
        });
        embeddingIds.set(legacyId, embedding.id);
      }
      counts.embeddingConfigs = source.embeddingConfigs.length;

      const vector = source.vectorConfigs[0];
      if (vector) {
        const data = {
          enabled: boolean(vector.enabled),
          workerUrl: String(vector.worker_url || ''),
          authTokenEncrypted: reencrypt(vector.auth_token_encrypted, sourceKey, targetKey),
          embeddingConfigId: embeddingIds.get(String(vector.embedding_config_id || '')) || null,
          indexMode: vector.index_mode === 'description' ? 'description' : 'readme',
          readmeMaxChars: integer(vector.readme_max_chars, 6000),
          status: parseJsonValue(vector.status_json),
          lastSyncAt: dateOrNull(vector.last_sync_at),
        };
        await tx.noStarVectorSearchConfig.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
        counts.vectorConfigs = 1;
      }

      let settingCount = 0;
      for (const row of source.settings) {
        const key = String(row.key || '');
        if (!key) continue;
        if (key === 'github_token') {
          await tx.noStarAccount.upsert({
            where: { userId: user.id },
            update: { githubTokenEncrypted: reencrypt(row.value, sourceKey, targetKey) },
            create: { userId: user.id, githubTokenEncrypted: reencrypt(row.value, sourceKey, targetKey) },
          });
        } else {
          await tx.noStarSetting.upsert({
            where: { userId_key: { userId: user.id, key } },
            update: { value: parseSettingValue(row.value) },
            create: { userId: user.id, key, value: parseSettingValue(row.value) },
          });
        }
        settingCount += 1;
      }
      counts.settings = settingCount;
    }, { timeout: 120000 });

    return { dryRun: false, userId: user.id, backupPath, counts };
  } finally {
    db.close();
  }
}

function resolveSourceKey(args: MigrationArgs) {
  if (args.sourceKey) return args.sourceKey;
  const keyPath = path.join(path.dirname(args.sqlitePath), '.encryption-key');
  if (!fs.existsSync(keyPath)) throw new Error(`Legacy encryption key not found: ${keyPath}`);
  return fs.readFileSync(keyPath, 'utf8').trim();
}

function readTable(db: DatabaseSync, table: string): Row[] {
  const found = db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', table);
  return found ? db.prepare(`SELECT * FROM ${table}`).all() as Row[] : [];
}

function repositoryData(row: Row) {
  return {
    name: String(row.name || ''), fullName: String(row.full_name || ''), description: nullable(row.description),
    htmlUrl: String(row.html_url || ''), stargazersCount: integer(row.stargazers_count), language: nullable(row.language),
    githubCreatedAt: dateOrNull(row.created_at), githubUpdatedAt: dateOrNull(row.updated_at), githubPushedAt: dateOrNull(row.pushed_at), starredAt: dateOrNull(row.starred_at),
    ownerLogin: String(row.owner_login || ''), ownerAvatarUrl: nullable(row.owner_avatar_url), topics: jsonArray(row.topics),
    aiSummary: nullable(row.ai_summary), aiTags: jsonArray(row.ai_tags), aiPlatforms: jsonArray(row.ai_platforms), analyzedAt: dateOrNull(row.analyzed_at),
    analysisFailed: boolean(row.analysis_failed), customDescription: nullable(row.custom_description), customTags: jsonArray(row.custom_tags),
    customCategory: nullable(row.custom_category), categoryLocked: boolean(row.category_locked), lastEditedAt: dateOrNull(row.last_edited),
    subscribedToReleases: boolean(row.subscribed_to_releases), vectorIndexedAt: dateOrNull(row.vector_indexed_at),
  };
}

function releaseData(row: Row, repositoryId: number) {
  return {
    repositoryId, tagName: String(row.tag_name || ''), name: nullable(row.name), body: nullable(row.body), publishedAt: dateOrNull(row.published_at),
    htmlUrl: nullable(row.html_url), assets: jsonArray(row.assets), zipballUrl: nullable(row.zipball_url), tarballUrl: nullable(row.tarball_url),
    repoFullName: String(row.repo_full_name || ''), repoName: String(row.repo_name || ''), prerelease: boolean(row.prerelease), draft: boolean(row.draft), isRead: boolean(row.is_read),
  };
}

function reencrypt(value: unknown, sourceKey: string, targetKey: string) {
  if (!value) return null;
  return encryptSecret(decryptLegacySecret(String(value), sourceKey), targetKey);
}

function parseSettingValue(value: unknown): any {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

function parseJsonValue(value: unknown): any {
  if (!value) return undefined;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return undefined; }
}

function jsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function nullable(value: unknown) {
  return value === null || value === undefined || value === '' ? null : String(value);
}

function integer(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function boolean(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await migrateNoStarSqlite(parseMigrationArgs(process.argv.slice(2)), prisma);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
