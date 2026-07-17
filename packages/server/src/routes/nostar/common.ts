import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireAdmin, requireAuth } from '../../plugins/auth.js';
import type { AppServices, AuthUser } from '../../types.js';
import { decryptSecret, encryptSecret } from '../../utils/crypto.js';

export type AnyRecord = Record<string, any>;

export const PROXY_SETTING_KEY = 'proxy_config';
export const RPC_SETTING_KEY = 'rpc_download_config';
export const DEBUG_SETTING_KEY = 'diagnostic_debug';

export async function authed(request: FastifyRequest, reply: FastifyReply, services: AppServices): Promise<AuthUser | null> {
  return requireAuth(request, reply, services);
}

export async function adminOnly(request: FastifyRequest, reply: FastifyReply, services: AppServices): Promise<AuthUser | null> {
  return requireAdmin(request, reply, services);
}

export function repositoryData(repo: AnyRecord) {
  return {
    githubId: requiredBigInt(repo.id, 'repository id'),
    name: text(repo.name),
    fullName: text(repo.full_name ?? repo.fullName),
    description: nullableText(repo.description),
    htmlUrl: text(repo.html_url ?? repo.htmlUrl),
    stargazersCount: boundedInt(repo.stargazers_count ?? repo.stargazersCount, 0, 0, 2_147_483_647),
    language: nullableText(repo.language),
    githubCreatedAt: dateOrNull(repo.created_at ?? repo.createdAt),
    githubUpdatedAt: dateOrNull(repo.updated_at ?? repo.updatedAt),
    githubPushedAt: dateOrNull(repo.pushed_at ?? repo.pushedAt),
    starredAt: dateOrNull(repo.starred_at ?? repo.starredAt),
    ownerLogin: text(repo.owner_login ?? repo.owner?.login ?? repo.ownerLogin),
    ownerAvatarUrl: nullableText(repo.owner_avatar_url ?? repo.owner?.avatar_url ?? repo.ownerAvatarUrl),
    topics: jsonArray(repo.topics),
    aiSummary: nullableText(repo.ai_summary ?? repo.aiSummary),
    aiTags: jsonArray(repo.ai_tags ?? repo.aiTags),
    aiPlatforms: jsonArray(repo.ai_platforms ?? repo.aiPlatforms),
    analyzedAt: dateOrNull(repo.analyzed_at ?? repo.analyzedAt),
    analysisFailed: Boolean(repo.analysis_failed ?? repo.analysisFailed),
    customDescription: nullableText(repo.custom_description ?? repo.customDescription),
    customTags: jsonArray(repo.custom_tags ?? repo.customTags),
    customCategory: nullableText(repo.custom_category ?? repo.customCategory),
    categoryLocked: Boolean(repo.category_locked ?? repo.categoryLocked),
    lastEditedAt: dateOrNull(repo.last_edited ?? repo.lastEdited),
    subscribedToReleases: Boolean(repo.subscribed_to_releases ?? repo.subscribedToReleases),
    vectorIndexedAt: dateOrNull(repo.vector_indexed_at ?? repo.vectorIndexedAt),
  };
}

export function toLegacyRepository(row: AnyRecord) {
  return {
    id: Number(row.githubId),
    name: row.name,
    full_name: row.fullName,
    description: row.description,
    html_url: row.htmlUrl,
    stargazers_count: row.stargazersCount,
    language: row.language,
    created_at: iso(row.githubCreatedAt),
    updated_at: iso(row.githubUpdatedAt),
    pushed_at: iso(row.githubPushedAt),
    starred_at: iso(row.starredAt),
    owner_login: row.ownerLogin,
    owner_avatar_url: row.ownerAvatarUrl,
    owner: { login: row.ownerLogin, avatar_url: row.ownerAvatarUrl },
    topics: row.topics || [],
    ai_summary: row.aiSummary,
    ai_tags: row.aiTags || [],
    ai_platforms: row.aiPlatforms || [],
    analyzed_at: iso(row.analyzedAt),
    analysis_failed: row.analysisFailed,
    custom_description: row.customDescription,
    custom_tags: row.customTags || [],
    custom_category: row.customCategory,
    category_locked: row.categoryLocked,
    last_edited: iso(row.lastEditedAt),
    subscribed_to_releases: row.subscribedToReleases,
    vector_indexed_at: iso(row.vectorIndexedAt),
  };
}

export async function findReleaseRepository(tx: AnyRecord, userId: number, release: AnyRecord) {
  const repoGithubId = release.repo_id ?? release.repoId;
  if (repoGithubId !== undefined && repoGithubId !== null) {
    return tx.noStarRepository.findUnique({ where: { userId_githubId: { userId, githubId: requiredBigInt(repoGithubId, 'repository id') } } });
  }
  const fullName = text(release.repo_full_name ?? release.repoFullName);
  return fullName ? tx.noStarRepository.findUnique({ where: { userId_fullName: { userId, fullName } } }) : null;
}

export function releaseData(release: AnyRecord, repositoryId: number) {
  return {
    repositoryId,
    tagName: text(release.tag_name ?? release.tagName),
    name: nullableText(release.name),
    body: nullableText(release.body),
    publishedAt: dateOrNull(release.published_at ?? release.publishedAt),
    htmlUrl: nullableText(release.html_url ?? release.htmlUrl),
    assets: jsonArray(release.assets),
    zipballUrl: nullableText(release.zipball_url ?? release.zipballUrl),
    tarballUrl: nullableText(release.tarball_url ?? release.tarballUrl),
    repoFullName: text(release.repo_full_name ?? release.repoFullName),
    repoName: text(release.repo_name ?? release.repoName),
    prerelease: Boolean(release.prerelease),
    draft: Boolean(release.draft),
    isRead: Boolean(release.is_read ?? release.isRead),
  };
}

export function toLegacyRelease(row: AnyRecord) {
  return {
    id: Number(row.githubId),
    tag_name: row.tagName,
    name: row.name,
    body: row.body,
    published_at: iso(row.publishedAt),
    html_url: row.htmlUrl,
    assets: row.assets || [],
    zipball_url: row.zipballUrl,
    tarball_url: row.tarballUrl,
    repo_full_name: row.repoFullName,
    repo_name: row.repoName,
    prerelease: row.prerelease,
    draft: row.draft,
    is_read: row.isRead,
  };
}

export async function replaceAiProfiles(services: AppServices, userId: number, configs: AnyRecord[]) {
  const existing = new Map((await services.prisma.noStarAiProfile.findMany({ where: { userId } })).map((row) => [row.legacyId, row.apiKeyEncrypted]));
  await services.prisma.$transaction(async (tx) => {
    await tx.noStarAiProfile.deleteMany({ where: { userId } });
    for (const config of configs) {
      const legacyId = text(config.id) || crypto.randomUUID();
      await tx.noStarAiProfile.create({ data: {
        userId,
        legacyId,
        name: text(config.name),
        apiType: text(config.apiType) || 'openai',
        baseUrl: text(config.baseUrl),
        apiKeyEncrypted: nextEncryptedSecret(config.apiKey, existing.get(legacyId), services.encryptionKey),
        model: text(config.model),
        isActive: Boolean(config.isActive),
        customPrompt: nullableText(config.customPrompt),
        useCustomPrompt: Boolean(config.useCustomPrompt),
        concurrency: boundedInt(config.concurrency, 1, 1, 32),
        reasoningEffort: nullableText(config.reasoningEffort),
        mimoPlan: nullableText(config.mimoPlan),
      } });
    }
  });
}

export async function replaceWebDavConfigs(services: AppServices, userId: number, configs: AnyRecord[]) {
  const existing = new Map((await services.prisma.noStarWebDavConfig.findMany({ where: { userId } })).map((row) => [row.legacyId, row.passwordEncrypted]));
  await services.prisma.$transaction(async (tx) => {
    await tx.noStarWebDavConfig.deleteMany({ where: { userId } });
    for (const config of configs) {
      const legacyId = text(config.id) || crypto.randomUUID();
      await tx.noStarWebDavConfig.create({ data: {
        userId,
        legacyId,
        name: text(config.name),
        url: text(config.url),
        username: text(config.username),
        passwordEncrypted: nextEncryptedSecret(config.password, existing.get(legacyId), services.encryptionKey),
        path: text(config.path) || '/',
        isActive: Boolean(config.isActive),
      } });
    }
  });
}

export async function replaceEmbeddingConfigs(services: AppServices, userId: number, configs: AnyRecord[]) {
  const existing = new Map((await services.prisma.noStarEmbeddingConfig.findMany({ where: { userId } })).map((row) => [row.legacyId, row.apiKeyEncrypted]));
  await services.prisma.$transaction(async (tx) => {
    await tx.noStarVectorSearchConfig.updateMany({ where: { userId }, data: { embeddingConfigId: null } });
    await tx.noStarEmbeddingConfig.deleteMany({ where: { userId } });
    for (const config of configs) {
      const legacyId = text(config.id) || crypto.randomUUID();
      await tx.noStarEmbeddingConfig.create({ data: {
        userId,
        legacyId,
        name: text(config.name),
        apiType: text(config.apiType) || 'openai',
        baseUrl: text(config.baseUrl),
        apiKeyEncrypted: nextEncryptedSecret(config.apiKey, existing.get(legacyId), services.encryptionKey),
        model: text(config.model),
        dimensions: boundedInt(config.dimensions, 1536, 1, 65536),
        isActive: Boolean(config.isActive),
      } });
    }
  });
}

export function vectorConfigData(input: AnyRecord, embeddingConfigId: string | null, authTokenEncrypted: string | null) {
  return {
    enabled: Boolean(input.enabled),
    workerUrl: text(input.workerUrl),
    authTokenEncrypted,
    embeddingConfigId,
    indexMode: input.indexMode === 'description' ? 'description' : 'readme',
    readmeMaxChars: boundedInt(input.readmeMaxChars, 6000, 1, 100000),
    status: input.status === undefined ? undefined : normalizeJson(input.status),
    lastSyncAt: dateOrNull(input.lastSyncAt),
  };
}

export function defaultVectorConfig() {
  return { enabled: false, workerUrl: '', authToken: '', embeddingConfigId: '', indexMode: 'readme', readmeMaxChars: 6000 };
}

export function nextEncryptedSecret(raw: unknown, existing: string | null | undefined, encryptionKey: string) {
  if (raw === '') return null;
  if (typeof raw !== 'string' || raw.startsWith('***')) return existing || null;
  return encryptSecret(raw, encryptionKey);
}

export function revealSecret(encrypted: string | null | undefined, key: string, reveal: boolean) {
  if (!encrypted) return '';
  const value = decryptSecret(encrypted, key);
  return reveal ? value : maskSecret(value);
}

export function maskSecret(value: string) {
  if (!value) return '';
  return value.length <= 4 ? '****' : `***${value.slice(-4)}`;
}

export function arrayField(body: unknown, key: string) {
  const value = asRecord(body)[key];
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

export function text(value: unknown) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

export function nullableText(value: unknown) {
  const valueText = text(value).trim();
  return valueText || null;
}

export function requiredBigInt(value: unknown, label: string) {
  try {
    return BigInt(String(value));
  } catch {
    throw Object.assign(new Error(`Invalid ${label}`), { statusCode: 400 });
  }
}

export function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value || null;
}

export function jsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

export function normalizeJson(value: unknown): any {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

export function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}
