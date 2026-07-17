import type { AppServices } from '../../types.js';
import { decryptSecret, encryptSecret } from '../../utils/crypto.js';
import {
  PROXY_SETTING_KEY,
  RPC_SETTING_KEY,
  arrayValue,
  asRecord,
  boundedInt,
  dateOrNull,
  findReleaseRepository,
  iso,
  jsonArray,
  maskSecret,
  nextEncryptedSecret,
  normalizeJson,
  nullableText,
  releaseData,
  repositoryData,
  requiredBigInt,
  revealSecret,
  text,
  toLegacyRelease,
  toLegacyRepository,
  type AnyRecord,
} from './common.js';
import {
  maskSettingValue,
  proxyConfigForStorage,
  rpcConfigForStorage,
  saveStoredConfig,
  storedConfig,
} from './network.js';

export async function exportNoStarData(services: AppServices, userId: number) {
  const [repositories, releases, categories, aiProfiles, webdavProfiles, assetFilters, settingRows, account, embeddingProfiles, vectorConfig] = await Promise.all([
    services.prisma.noStarRepository.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    services.prisma.noStarRelease.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    services.prisma.noStarCategory.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    services.prisma.noStarAiProfile.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    services.prisma.noStarWebDavConfig.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    services.prisma.noStarAssetFilter.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    services.prisma.noStarSetting.findMany({ where: { userId } }),
    services.prisma.noStarAccount.findUnique({ where: { userId } }),
    services.prisma.noStarEmbeddingConfig.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    services.prisma.noStarVectorSearchConfig.findUnique({ where: { userId }, include: { embeddingConfig: true } }),
  ]);
  const settings = Object.fromEntries(settingRows.map((row) => [row.key, maskSettingValue(row.key, row.value, services.encryptionKey)]));
  if (account?.githubTokenEncrypted) settings.github_token = maskSecret(decryptSecret(account.githubTokenEncrypted, services.encryptionKey));
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    repositories: repositories.map(toLegacyRepository),
    releases: releases.map(toLegacyRelease),
    categories: categories.map((row) => ({
      id: row.legacyId || row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      keywords: row.keywords,
      color: row.color,
      sort_order: row.sortOrder,
      is_custom: row.isCustom,
    })),
    asset_filters: assetFilters.map((row) => ({
      id: row.legacyId,
      name: row.name,
      description: row.description,
      keywords: row.keywords,
      platform: row.platform,
      sort_order: row.sortOrder,
    })),
    ai_configs: aiProfiles.map((row) => ({
      id: row.legacyId,
      name: row.name,
      api_type: row.apiType,
      base_url: row.baseUrl,
      api_key_masked: revealSecret(row.apiKeyEncrypted, services.encryptionKey, false),
      model: row.model,
      is_active: row.isActive,
      custom_prompt: row.customPrompt,
      use_custom_prompt: row.useCustomPrompt,
      concurrency: row.concurrency,
      reasoning_effort: row.reasoningEffort,
      mimo_plan: row.mimoPlan,
    })),
    webdav_configs: webdavProfiles.map((row) => ({
      id: row.legacyId,
      name: row.name,
      url: row.url,
      username: row.username,
      password_masked: revealSecret(row.passwordEncrypted, services.encryptionKey, false),
      path: row.path,
      is_active: row.isActive,
    })),
    embedding_configs: embeddingProfiles.map((row) => ({
      id: row.legacyId,
      name: row.name,
      api_type: row.apiType,
      base_url: row.baseUrl,
      api_key_masked: revealSecret(row.apiKeyEncrypted, services.encryptionKey, false),
      model: row.model,
      dimensions: row.dimensions,
      is_active: row.isActive,
    })),
    vector_search_config: vectorConfig ? {
      enabled: vectorConfig.enabled,
      worker_url: vectorConfig.workerUrl,
      auth_token_masked: revealSecret(vectorConfig.authTokenEncrypted, services.encryptionKey, false),
      embedding_config_id: vectorConfig.embeddingConfig?.legacyId || '',
      index_mode: vectorConfig.indexMode,
      readme_max_chars: vectorConfig.readmeMaxChars,
      status: vectorConfig.status,
      last_sync_at: iso(vectorConfig.lastSyncAt),
    } : null,
    settings,
  };
}

export async function importNoStarData(services: AppServices, userId: number, data: AnyRecord) {
  const counts: Record<string, number> = {};
  const repositories = arrayValue(data.repositories);
  for (const repository of repositories) {
    const row = repositoryData(repository);
    await services.prisma.noStarRepository.upsert({
      where: { userId_githubId: { userId, githubId: row.githubId } },
      update: row,
      create: { userId, ...row },
    });
  }
  if (repositories.length) counts.repositories = repositories.length;

  const releases = arrayValue(data.releases);
  let releaseCount = 0;
  for (const release of releases) {
    const repository = await findReleaseRepository(services.prisma, userId, release);
    if (!repository) continue;
    const githubId = requiredBigInt(release.id, 'release id');
    const row = releaseData(release, repository.id);
    await services.prisma.noStarRelease.upsert({
      where: { userId_githubId: { userId, githubId } },
      update: row,
      create: { userId, githubId, ...row },
    });
    releaseCount++;
  }
  if (releaseCount) counts.releases = releaseCount;

  const categories = arrayValue(data.categories);
  for (const category of categories) {
    const legacyId = text(category.id ?? category.legacyId) || crypto.randomUUID();
    const row = {
      name: text(category.name),
      description: nullableText(category.description),
      icon: text(category.icon) || 'folder',
      keywords: jsonArray(category.keywords),
      color: nullableText(category.color),
      sortOrder: boundedInt(category.sort_order ?? category.sortOrder, 0, -100000, 100000),
      isCustom: Boolean(category.is_custom ?? category.isCustom),
    };
    await services.prisma.noStarCategory.upsert({
      where: { userId_legacyId: { userId, legacyId } },
      update: row,
      create: { userId, legacyId, ...row },
    });
  }
  if (categories.length) counts.categories = categories.length;

  const filters = arrayValue(data.asset_filters ?? data.assetFilters);
  for (const filter of filters) {
    const legacyId = text(filter.id ?? filter.legacyId) || crypto.randomUUID();
    const row = {
      name: text(filter.name),
      description: nullableText(filter.description),
      keywords: jsonArray(filter.keywords),
      platform: nullableText(filter.platform),
      sortOrder: boundedInt(filter.sort_order ?? filter.sortOrder, 0, -100000, 100000),
    };
    await services.prisma.noStarAssetFilter.upsert({
      where: { userId_legacyId: { userId, legacyId } },
      update: row,
      create: { userId, legacyId, ...row },
    });
  }
  if (filters.length) counts.asset_filters = filters.length;

  const aiProfiles = arrayValue(data.ai_configs ?? data.aiConfigs);
  for (const profile of aiProfiles) await upsertImportedAiProfile(services, userId, profile);
  if (aiProfiles.length) counts.ai_configs = aiProfiles.length;

  const webdavProfiles = arrayValue(data.webdav_configs ?? data.webdavConfigs);
  for (const profile of webdavProfiles) await upsertImportedWebDavProfile(services, userId, profile);
  if (webdavProfiles.length) counts.webdav_configs = webdavProfiles.length;

  const embeddingProfiles = arrayValue(data.embedding_configs ?? data.embeddingConfigs);
  for (const profile of embeddingProfiles) await upsertImportedEmbeddingProfile(services, userId, profile);
  if (embeddingProfiles.length) counts.embedding_configs = embeddingProfiles.length;

  const vector = asRecord(data.vector_search_config ?? data.vectorSearchConfig);
  if (Object.keys(vector).length) {
    const legacyId = text(vector.embedding_config_id ?? vector.embeddingConfigId);
    const embedding = legacyId
      ? await services.prisma.noStarEmbeddingConfig.findUnique({ where: { userId_legacyId: { userId, legacyId } } })
      : null;
    const existing = await services.prisma.noStarVectorSearchConfig.findUnique({ where: { userId } });
    const rawToken = vector.auth_token ?? vector.authToken;
    const encrypted = nextEncryptedSecret(rawToken, existing?.authTokenEncrypted, services.encryptionKey);
    const normalized = {
      enabled: Boolean(vector.enabled),
      workerUrl: text(vector.worker_url ?? vector.workerUrl),
      authTokenEncrypted: encrypted,
      embeddingConfigId: embedding?.id || null,
      indexMode: (vector.index_mode ?? vector.indexMode) === 'description' ? 'description' : 'readme',
      readmeMaxChars: boundedInt(vector.readme_max_chars ?? vector.readmeMaxChars, 6000, 1, 100000),
      status: vector.status === undefined ? undefined : normalizeJson(vector.status),
      lastSyncAt: dateOrNull(vector.last_sync_at ?? vector.lastSyncAt),
    };
    await services.prisma.noStarVectorSearchConfig.upsert({ where: { userId }, update: normalized, create: { userId, ...normalized } });
    counts.vector_search_config = 1;
  }

  const settings = asRecord(data.settings);
  let settingsCount = 0;
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'github_token') {
      if (typeof value !== 'string' || value.startsWith('***')) continue;
      await services.prisma.noStarAccount.upsert({
        where: { userId },
        update: { githubTokenEncrypted: value ? encryptSecret(value, services.encryptionKey) : null },
        create: { userId, githubTokenEncrypted: value ? encryptSecret(value, services.encryptionKey) : null },
      });
      settingsCount++;
      continue;
    }
    if (key === PROXY_SETTING_KEY) {
      const existing = await storedConfig(services, userId, key);
      await saveStoredConfig(services, userId, key, proxyConfigForStorage(asRecord(value), existing, services.encryptionKey));
      settingsCount++;
      continue;
    }
    if (key === RPC_SETTING_KEY) {
      const existing = await storedConfig(services, userId, key);
      await saveStoredConfig(services, userId, key, rpcConfigForStorage(asRecord(value), existing, services.encryptionKey));
      settingsCount++;
      continue;
    }
    await services.prisma.noStarSetting.upsert({
      where: { userId_key: { userId, key } },
      update: { value: normalizeJson(value) },
      create: { userId, key, value: normalizeJson(value) },
    });
    settingsCount++;
  }
  if (settingsCount) counts.settings = settingsCount;
  return counts;
}

async function upsertImportedAiProfile(services: AppServices, userId: number, profile: AnyRecord) {
  const legacyId = text(profile.id) || crypto.randomUUID();
  const existing = await services.prisma.noStarAiProfile.findUnique({ where: { userId_legacyId: { userId, legacyId } } });
  const row = {
    name: text(profile.name),
    apiType: text(profile.api_type ?? profile.apiType) || 'openai',
    baseUrl: text(profile.base_url ?? profile.baseUrl),
    apiKeyEncrypted: nextEncryptedSecret(profile.api_key ?? profile.apiKey, existing?.apiKeyEncrypted, services.encryptionKey),
    model: text(profile.model),
    isActive: Boolean(profile.is_active ?? profile.isActive),
    customPrompt: nullableText(profile.custom_prompt ?? profile.customPrompt),
    useCustomPrompt: Boolean(profile.use_custom_prompt ?? profile.useCustomPrompt),
    concurrency: boundedInt(profile.concurrency, 1, 1, 32),
    reasoningEffort: nullableText(profile.reasoning_effort ?? profile.reasoningEffort),
    mimoPlan: nullableText(profile.mimo_plan ?? profile.mimoPlan),
  };
  await services.prisma.noStarAiProfile.upsert({ where: { userId_legacyId: { userId, legacyId } }, update: row, create: { userId, legacyId, ...row } });
}

async function upsertImportedWebDavProfile(services: AppServices, userId: number, profile: AnyRecord) {
  const legacyId = text(profile.id) || crypto.randomUUID();
  const existing = await services.prisma.noStarWebDavConfig.findUnique({ where: { userId_legacyId: { userId, legacyId } } });
  const row = {
    name: text(profile.name),
    url: text(profile.url),
    username: text(profile.username),
    passwordEncrypted: nextEncryptedSecret(profile.password, existing?.passwordEncrypted, services.encryptionKey),
    path: text(profile.path) || '/',
    isActive: Boolean(profile.is_active ?? profile.isActive),
  };
  await services.prisma.noStarWebDavConfig.upsert({ where: { userId_legacyId: { userId, legacyId } }, update: row, create: { userId, legacyId, ...row } });
}

async function upsertImportedEmbeddingProfile(services: AppServices, userId: number, profile: AnyRecord) {
  const legacyId = text(profile.id) || crypto.randomUUID();
  const existing = await services.prisma.noStarEmbeddingConfig.findUnique({ where: { userId_legacyId: { userId, legacyId } } });
  const row = {
    name: text(profile.name),
    apiType: text(profile.api_type ?? profile.apiType) || 'openai',
    baseUrl: text(profile.base_url ?? profile.baseUrl),
    apiKeyEncrypted: nextEncryptedSecret(profile.api_key ?? profile.apiKey, existing?.apiKeyEncrypted, services.encryptionKey),
    model: text(profile.model),
    dimensions: boundedInt(profile.dimensions, 1536, 1, 65536),
    isActive: Boolean(profile.is_active ?? profile.isActive),
  };
  await services.prisma.noStarEmbeddingConfig.upsert({ where: { userId_legacyId: { userId, legacyId } }, update: row, create: { userId, legacyId, ...row } });
}
