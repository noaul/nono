import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { sendOk } from '../plugins/responses.js';
import type { AppServices, AuthUser } from '../types.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';

type AnyRecord = Record<string, any>;

export async function nostarRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/nostar/health', async () => ({
    status: 'ok',
    version: 'nono-integrated',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/nostar/settings', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const [rows, account] = await Promise.all([
      services.prisma.noStarSetting.findMany({ where: { userId: user.id } }),
      services.prisma.noStarAccount.findUnique({ where: { userId: user.id } }),
    ]);
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    if (account?.githubTokenEncrypted) {
      settings.github_token = maskSecret(decryptSecret(account.githubTokenEncrypted, services.encryptionKey));
      settings.github_token_status = 'ok';
    } else {
      settings.github_token_status = 'empty';
    }
    return settings;
  });

  app.put('/api/nostar/settings', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const updates = asRecord(request.body);
    await services.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'github_token') {
          if (typeof value !== 'string' || value.startsWith('***')) continue;
          await tx.noStarAccount.upsert({
            where: { userId: user.id },
            update: { githubTokenEncrypted: value ? encryptSecret(value, services.encryptionKey) : null },
            create: { userId: user.id, githubTokenEncrypted: value ? encryptSecret(value, services.encryptionKey) : null },
          });
          continue;
        }
        if (value === undefined) continue;
        await tx.noStarSetting.upsert({
          where: { userId_key: { userId: user.id, key } },
          update: { value: normalizeJson(value) },
          create: { userId: user.id, key, value: normalizeJson(value) },
        });
      }
    });
    return { updated: true };
  });

  app.get('/api/nostar/repositories', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const query = asRecord(request.query);
    const limit = boundedInt(query.limit, 10000, 1, 10000);
    const [rows, total] = await Promise.all([
      services.prisma.noStarRepository.findMany({ where: { userId: user.id }, orderBy: [{ starredAt: 'desc' }, { id: 'asc' }], take: limit }),
      services.prisma.noStarRepository.count({ where: { userId: user.id } }),
    ]);
    return { repositories: rows.map(toLegacyRepository), total };
  });

  app.put('/api/nostar/repositories', { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const body = asRecord(request.body);
    const repositories = Array.isArray(body.repositories) ? body.repositories.map(asRecord) : [];
    const githubIds = repositories.map((repo) => requiredBigInt(repo.id, 'repository id'));
    await services.prisma.$transaction(async (tx) => {
      for (const repository of repositories) {
        const data = repositoryData(repository);
        await tx.noStarRepository.upsert({
          where: { userId_githubId: { userId: user.id, githubId: data.githubId } },
          update: data,
          create: { userId: user.id, ...data },
        });
      }
      if (body.isFullSync === true) {
        await tx.noStarRepository.deleteMany({ where: { userId: user.id, githubId: { notIn: githubIds } } });
      }
    });
    return { synced: repositories.length };
  });

  app.get('/api/nostar/releases', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const query = asRecord(request.query);
    const limit = boundedInt(query.limit, 10000, 1, 10000);
    const [rows, total] = await Promise.all([
      services.prisma.noStarRelease.findMany({ where: { userId: user.id }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: limit }),
      services.prisma.noStarRelease.count({ where: { userId: user.id } }),
    ]);
    return { releases: rows.map(toLegacyRelease), total };
  });

  app.put('/api/nostar/releases', { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const body = asRecord(request.body);
    const releases = Array.isArray(body.releases) ? body.releases.map(asRecord) : [];
    await services.prisma.$transaction(async (tx) => {
      for (const release of releases) {
        const githubId = requiredBigInt(release.id, 'release id');
        const repository = await findReleaseRepository(tx, user.id, release);
        if (!repository) continue;
        const data = releaseData(release, repository.id);
        await tx.noStarRelease.upsert({
          where: { userId_githubId: { userId: user.id, githubId } },
          update: data,
          create: { userId: user.id, githubId, ...data },
        });
      }
    });
    return { synced: releases.length };
  });

  app.post('/api/nostar/releases/mark-all-read', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const result = await services.prisma.noStarRelease.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    return { updated: result.count };
  });

  app.get('/api/nostar/configs/ai', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const decrypt = asRecord(request.query).decrypt === 'true';
    const rows = await services.prisma.noStarAiProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => ({
      id: row.legacyId,
      name: row.name,
      apiType: row.apiType,
      baseUrl: row.baseUrl,
      apiKey: revealSecret(row.apiKeyEncrypted, services.encryptionKey, decrypt),
      model: row.model,
      isActive: row.isActive,
      customPrompt: row.customPrompt || '',
      useCustomPrompt: row.useCustomPrompt,
      concurrency: row.concurrency,
      reasoningEffort: row.reasoningEffort || undefined,
      mimoPlan: row.mimoPlan || undefined,
    }));
  });

  app.get('/api/admin/nostar/ai', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const rows = await services.prisma.noStarAiProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    return sendOk(reply, rows.map((row) => ({
      id: row.legacyId,
      name: row.name,
      apiType: row.apiType,
      baseUrl: row.baseUrl,
      apiKey: revealSecret(row.apiKeyEncrypted, services.encryptionKey, false),
      model: row.model,
      isActive: row.isActive,
      customPrompt: row.customPrompt || '',
      useCustomPrompt: row.useCustomPrompt,
      concurrency: row.concurrency,
      reasoningEffort: row.reasoningEffort || 'none',
    })));
  });

  app.put('/api/admin/nostar/ai', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const profiles = arrayField(request.body, 'profiles');
    await replaceAiProfiles(services, user.id, profiles);
    return sendOk(reply, { saved: profiles.length });
  });

  app.post('/api/admin/nostar/ai/test', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const existing = input.id
      ? await services.prisma.noStarAiProfile.findUnique({ where: { userId_legacyId: { userId: user.id, legacyId: text(input.id) } } })
      : null;
    const apiType = text(input.apiType || existing?.apiType) || 'openai';
    const baseUrl = text(input.baseUrl || existing?.baseUrl);
    const model = text(input.model || existing?.model);
    const rawKey = text(input.apiKey);
    const apiKey = rawKey && !rawKey.startsWith('***')
      ? rawKey
      : decryptSecret(existing?.apiKeyEncrypted, services.encryptionKey);
    if (!baseUrl || !model || (!apiKey && apiType !== 'ollama')) {
      throw Object.assign(new Error('请完整填写 API 地址、模型和 API Key'), { statusCode: 400 });
    }
    const target = aiTarget({ apiType, baseUrl, apiKey, model });
    const response = await fetch(target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify(aiTestBody(apiType, model)),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw Object.assign(new Error(`连接失败：HTTP ${response.status}${detail ? ` · ${detail}` : ''}`), { statusCode: 400 });
    }
    return sendOk(reply, { ok: true, model, apiType });
  });

  app.put('/api/nostar/configs/ai/bulk', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const configs = arrayField(request.body, 'configs');
    await replaceAiProfiles(services, user.id, configs);
    return { synced: configs.length, skipped: 0, errors: [] };
  });

  app.get('/api/nostar/configs/webdav', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const decrypt = asRecord(request.query).decrypt === 'true';
    const rows = await services.prisma.noStarWebDavConfig.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => ({
      id: row.legacyId,
      name: row.name,
      url: row.url,
      username: row.username,
      password: revealSecret(row.passwordEncrypted, services.encryptionKey, decrypt),
      path: row.path,
      isActive: row.isActive,
    }));
  });

  app.put('/api/nostar/configs/webdav/bulk', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const configs = arrayField(request.body, 'configs');
    await replaceWebDavConfigs(services, user.id, configs);
    return { synced: configs.length, skipped: 0, errors: [] };
  });

  app.get('/api/nostar/configs/embedding', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const decrypt = asRecord(request.query).decrypt === 'true';
    const rows = await services.prisma.noStarEmbeddingConfig.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => ({
      id: row.legacyId,
      name: row.name,
      apiType: row.apiType,
      baseUrl: row.baseUrl,
      apiKey: revealSecret(row.apiKeyEncrypted, services.encryptionKey, decrypt),
      model: row.model,
      dimensions: row.dimensions,
      isActive: row.isActive,
    }));
  });

  app.put('/api/nostar/configs/embedding/bulk', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const configs = arrayField(request.body, 'configs');
    await replaceEmbeddingConfigs(services, user.id, configs);
    return { synced: configs.length, skipped: 0, errors: [] };
  });

  app.get('/api/nostar/configs/vector-search', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const decrypt = asRecord(request.query).decrypt === 'true';
    const row = await services.prisma.noStarVectorSearchConfig.findUnique({
      where: { userId: user.id },
      include: { embeddingConfig: true },
    });
    if (!row) return defaultVectorConfig();
    return {
      enabled: row.enabled,
      workerUrl: row.workerUrl,
      authToken: revealSecret(row.authTokenEncrypted, services.encryptionKey, decrypt),
      embeddingConfigId: row.embeddingConfig?.legacyId || '',
      indexMode: row.indexMode,
      readmeMaxChars: row.readmeMaxChars,
      status: row.status || undefined,
      lastSyncAt: row.lastSyncAt?.toISOString() || null,
    };
  });

  app.put('/api/nostar/configs/vector-search', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const existing = await services.prisma.noStarVectorSearchConfig.findUnique({ where: { userId: user.id } });
    const embedding = typeof input.embeddingConfigId === 'string' && input.embeddingConfigId
      ? await services.prisma.noStarEmbeddingConfig.findUnique({ where: { userId_legacyId: { userId: user.id, legacyId: input.embeddingConfigId } } })
      : null;
    const authTokenEncrypted = nextEncryptedSecret(input.authToken, existing?.authTokenEncrypted, services.encryptionKey);
    await services.prisma.noStarVectorSearchConfig.upsert({
      where: { userId: user.id },
      update: vectorConfigData(input, embedding?.id || null, authTokenEncrypted),
      create: { userId: user.id, ...vectorConfigData(input, embedding?.id || null, authTokenEncrypted) },
    });
    return { updated: true };
  });

  app.post('/api/nostar/proxy/github/graphql', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const token = await githubTokenFor(services, user.id);
    const body = asRecord(request.body);
    if (!body.query) return reply.status(400).send({ error: 'query required', code: 'QUERY_REQUIRED' });
    return proxyJson(reply, 'https://api.github.com/graphql', {
      method: 'POST',
      headers: githubHeaders(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({ query: body.query, variables: body.variables }),
    });
  });

  app.post('/api/nostar/proxy/github/*', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const token = await githubTokenFor(services, user.id);
    const input = asRecord(request.body);
    const rawSuffix = request.url.split('/api/nostar/proxy/github/')[1] || '';
    const suffix = rawSuffix.replace(/^\/+/, '');
    if (!suffix || suffix.includes('..') || /[\r\n]/.test(suffix)) {
      return reply.status(400).send({ error: 'Invalid GitHub API path', code: 'INVALID_GITHUB_PATH' });
    }
    const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return reply.status(400).send({ error: 'Unsupported GitHub method', code: 'INVALID_GITHUB_METHOD' });
    }
    const extraHeaders = asRecord(input.headers);
    delete extraHeaders.authorization;
    delete extraHeaders.Authorization;
    return proxyJson(reply, `https://api.github.com/${suffix}`, {
      method,
      headers: githubHeaders(token, extraHeaders),
      body: method === 'GET' || input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  });

  app.post('/api/nostar/proxy/ai', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const inline = asRecord(input.config);
    let apiType = text(inline.apiType) || 'openai';
    let baseUrl = text(inline.baseUrl);
    let apiKey = text(inline.apiKey);
    let model = text(inline.model);
    let reasoningEffort = nullableText(inline.reasoningEffort);

    if (input.configId) {
      const profile = await services.prisma.noStarAiProfile.findUnique({
        where: { userId_legacyId: { userId: user.id, legacyId: text(input.configId) } },
      });
      if (!profile) return reply.status(404).send({ error: 'AI config not found', code: 'AI_CONFIG_NOT_FOUND' });
      apiType = profile.apiType;
      baseUrl = profile.baseUrl;
      apiKey = decryptSecret(profile.apiKeyEncrypted, services.encryptionKey);
      model = profile.model;
      reasoningEffort = profile.reasoningEffort;
    }

    if (!baseUrl || !model || (!apiKey && apiType !== 'ollama')) {
      return reply.status(400).send({ error: 'baseUrl, apiKey, and model are required', code: 'INVALID_REQUEST' });
    }
    const target = aiTarget({ apiType, baseUrl, apiKey, model });
    const requestBody = asRecord(input.body);
    const effectiveBody = reasoningEffort && !('reasoning' in requestBody)
      ? { ...requestBody, reasoning: { effort: reasoningEffort === 'minimal' ? 'low' : reasoningEffort } }
      : requestBody;
    return proxyJson(reply, target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify(effectiveBody),
      signal: AbortSignal.timeout(reasoningEffort ? 600000 : 120000),
    });
  });

  app.post('/api/nostar/proxy/webdav', { bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const config = await services.prisma.noStarWebDavConfig.findUnique({
      where: { userId_legacyId: { userId: user.id, legacyId: text(input.configId) } },
    });
    if (!config) return reply.status(404).send({ error: 'WebDAV config not found', code: 'WEBDAV_CONFIG_NOT_FOUND' });
    const method = text(input.method).toUpperCase();
    if (!['GET', 'PUT', 'DELETE', 'PROPFIND', 'MKCOL', 'MOVE', 'COPY', 'HEAD'].includes(method)) {
      return reply.status(400).send({ error: 'Unsupported WebDAV method', code: 'INVALID_WEBDAV_METHOD' });
    }
    const targetUrl = new URL(text(input.path).replace(/^\/+/, ''), config.url.endsWith('/') ? config.url : `${config.url}/`);
    const headers = asRecord(input.headers);
    delete headers.authorization;
    delete headers.Authorization;
    headers.authorization = `Basic ${Buffer.from(`${config.username}:${decryptSecret(config.passwordEncrypted, services.encryptionKey)}`).toString('base64')}`;
    const response = await fetch(targetUrl, {
      method,
      headers: headers as Record<string, string>,
      body: ['GET', 'HEAD'].includes(method) ? undefined : typeof input.body === 'string' ? input.body : undefined,
      signal: AbortSignal.timeout(60000),
    });
    const responseBody = await response.text();
    return reply.status(response.status).type(response.headers.get('content-type') || 'text/plain; charset=utf-8').send(responseBody);
  });
}

async function authed(request: FastifyRequest, reply: FastifyReply, services: AppServices): Promise<AuthUser | null> {
  return requireAuth(request, reply, services);
}

function repositoryData(repo: AnyRecord) {
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

function toLegacyRepository(row: AnyRecord) {
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

async function findReleaseRepository(tx: AnyRecord, userId: number, release: AnyRecord) {
  const repoGithubId = release.repo_id ?? release.repoId;
  if (repoGithubId !== undefined && repoGithubId !== null) {
    return tx.noStarRepository.findUnique({ where: { userId_githubId: { userId, githubId: requiredBigInt(repoGithubId, 'repository id') } } });
  }
  const fullName = text(release.repo_full_name ?? release.repoFullName);
  return fullName ? tx.noStarRepository.findUnique({ where: { userId_fullName: { userId, fullName } } }) : null;
}

function releaseData(release: AnyRecord, repositoryId: number) {
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

function toLegacyRelease(row: AnyRecord) {
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

async function replaceAiProfiles(services: AppServices, userId: number, configs: AnyRecord[]) {
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

async function replaceWebDavConfigs(services: AppServices, userId: number, configs: AnyRecord[]) {
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

async function replaceEmbeddingConfigs(services: AppServices, userId: number, configs: AnyRecord[]) {
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

function vectorConfigData(input: AnyRecord, embeddingConfigId: string | null, authTokenEncrypted: string | null) {
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

function defaultVectorConfig() {
  return { enabled: false, workerUrl: '', authToken: '', embeddingConfigId: '', indexMode: 'readme', readmeMaxChars: 6000 };
}

async function githubTokenFor(services: AppServices, userId: number) {
  const account = await services.prisma.noStarAccount.findUnique({ where: { userId } });
  if (!account?.githubTokenEncrypted) {
    throw Object.assign(new Error('GitHub token not configured'), { statusCode: 400, code: 'GITHUB_TOKEN_NOT_CONFIGURED' });
  }
  return decryptSecret(account.githubTokenEncrypted, services.encryptionKey);
}

function githubHeaders(token: string, extra: AnyRecord = {}) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'NoStar-Nono',
    'x-github-api-version': '2022-11-28',
    ...extra,
  } as Record<string, string>;
}

async function proxyJson(reply: FastifyReply, url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(120000) });
  const body = await response.text();
  const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';
  return reply.status(response.status).type(contentType).send(body);
}

function aiTarget(input: { apiType: string; baseUrl: string; apiKey: string; model: string }) {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) throw Object.assign(new Error('Invalid AI base URL'), { statusCode: 400 });
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
  if (input.apiType === 'claude') {
    headers['x-api-key'] = input.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return { url: appendApiPath(baseUrl, 'v1/messages'), headers };
  }
  if (input.apiType === 'gemini') {
    const model = input.model.replace(/^models\//, '');
    const url = new URL(appendApiPath(baseUrl, `v1beta/models/${encodeURIComponent(model)}:generateContent`));
    url.searchParams.set('key', input.apiKey);
    return { url: url.toString(), headers };
  }
  headers.authorization = `Bearer ${input.apiKey}`;
  const endpoint = input.apiType === 'openai-responses' ? 'v1/responses' : 'v1/chat/completions';
  return { url: input.apiType === 'openai-compatible' ? baseUrl : appendApiPath(baseUrl, endpoint), headers };
}

function appendApiPath(baseUrl: string, path: string) {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith(`/${path}`)) return normalized;
  return `${normalized}/${path}`;
}

function aiTestBody(apiType: string, model: string) {
  if (apiType === 'claude') return { model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK.' }] };
  if (apiType === 'gemini') return { contents: [{ parts: [{ text: 'Reply OK.' }] }] };
  return { model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK.' }] };
}

function nextEncryptedSecret(raw: unknown, existing: string | null | undefined, encryptionKey: string) {
  if (raw === '') return null;
  if (typeof raw !== 'string' || raw.startsWith('***')) return existing || null;
  return encryptSecret(raw, encryptionKey);
}

function revealSecret(encrypted: string | null | undefined, key: string, reveal: boolean) {
  if (!encrypted) return '';
  const value = decryptSecret(encrypted, key);
  return reveal ? value : maskSecret(value);
}

function maskSecret(value: string) {
  if (!value) return '';
  return value.length <= 4 ? '****' : `***${value.slice(-4)}`;
}

function arrayField(body: unknown, key: string) {
  const value = asRecord(body)[key];
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function nullableText(value: unknown) {
  const valueText = text(value).trim();
  return valueText || null;
}

function requiredBigInt(value: unknown, label: string) {
  try {
    return BigInt(String(value));
  } catch {
    throw Object.assign(new Error(`Invalid ${label}`), { statusCode: 400 });
  }
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function jsonArray(value: unknown) {
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

function normalizeJson(value: unknown): any {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}
