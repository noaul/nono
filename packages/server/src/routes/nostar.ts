import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import axios, { type AxiosRequestConfig } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { requireAuth } from '../plugins/auth.js';
import { sendOk } from '../plugins/responses.js';
import type { AppServices, AuthUser } from '../types.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';

type AnyRecord = Record<string, any>;

const PROXY_SETTING_KEY = 'proxy_config';
const RPC_SETTING_KEY = 'rpc_download_config';
const DEBUG_SETTING_KEY = 'diagnostic_debug';

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
    const settings = Object.fromEntries(rows.map((row) => [row.key, maskSettingValue(row.key, row.value, services.encryptionKey)]));
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

  app.get('/api/nostar/settings/proxy', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    return publicProxyConfig(await storedConfig(services, user.id, PROXY_SETTING_KEY));
  });

  app.put('/api/nostar/settings/proxy', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const existing = await storedConfig(services, user.id, PROXY_SETTING_KEY);
    const config = proxyConfigForStorage(input, existing, services.encryptionKey);
    await saveStoredConfig(services, user.id, PROXY_SETTING_KEY, config);
    return { success: true };
  });

  app.post('/api/nostar/settings/proxy/test', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const existing = await storedConfig(services, user.id, PROXY_SETTING_KEY);
    try {
      const config = proxyConfigForRequest(input, existing, services.encryptionKey);
      if (!config.host || !config.port) return { success: false, error: 'Host and port are required' };
      const response = await externalRequest('https://api.github.com/rate_limit', {
        method: 'GET',
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'NoStar-Nono' },
        timeout: 10000,
      }, config);
      return { success: response.status >= 200 && response.status < 500, status: response.status };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  });

  app.get('/api/nostar/settings/rpc-download', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    return publicRpcConfig(await storedConfig(services, user.id, RPC_SETTING_KEY));
  });

  app.put('/api/nostar/settings/rpc-download', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const existing = await storedConfig(services, user.id, RPC_SETTING_KEY);
    const config = rpcConfigForStorage(input, existing, services.encryptionKey);
    await saveStoredConfig(services, user.id, RPC_SETTING_KEY, config);
    return { success: true };
  });

  app.post('/api/nostar/settings/rpc-download/test', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const existing = await storedConfig(services, user.id, RPC_SETTING_KEY);
    const config = rpcConfigForRequest(asRecord(request.body), existing, services.encryptionKey);
    if (!config.host || !config.port) return { success: false, error: 'Host and port are required' };
    return callAria2(config, 'aria2.getVersion', [], 'test');
  });

  app.post('/api/nostar/download/rpc', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const stored = await storedConfig(services, user.id, RPC_SETTING_KEY);
    const config = rpcConfigForRequest({}, stored, services.encryptionKey);
    if (!config.enabled || !config.host || !config.port) {
      return reply.status(400).send({ success: false, error: 'RPC download not configured or disabled' });
    }
    const input = asRecord(request.body);
    const url = text(input.url);
    if (!isHttpUrl(url)) return reply.status(400).send({ success: false, error: 'A valid HTTP(S) URL is required' });
    const options = text(input.filename) ? [{ out: text(input.filename) }] : [];
    return callAria2(config, 'aria2.addUri', [[url], ...options], 'download');
  });

  app.get('/api/nostar/logs/debug', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const row = await storedConfig(services, user.id, DEBUG_SETTING_KEY);
    return { debugMode: Boolean(row.enabled) };
  });

  app.post('/api/nostar/logs/debug', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const enabled = Boolean(asRecord(request.body).enabled);
    await saveStoredConfig(services, user.id, DEBUG_SETTING_KEY, { enabled });
    return { debugMode: enabled };
  });

  app.get('/api/nostar/logs', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    reply.header('X-Log-Count', '0');
    return [];
  });

  app.delete('/api/nostar/logs', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    return { cleared: true };
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

  app.post('/api/nostar/sync/export', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    return exportNoStarData(services, user.id);
  });

  app.post('/api/nostar/sync/import', { bodyLimit: 64 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const data = asRecord(request.body);
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'Invalid data format', code: 'INVALID_DATA_FORMAT' });
    }
    return { imported: await importNoStarData(services, user.id, data) };
  });

  app.post('/api/nostar/proxy/github/graphql', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const token = await githubTokenFor(services, user.id);
    const proxy = await userProxyConfig(services, user.id);
    const body = asRecord(request.body);
    if (!body.query) return reply.status(400).send({ error: 'query required', code: 'QUERY_REQUIRED' });
    return proxyJson(reply, 'https://api.github.com/graphql', {
      method: 'POST',
      headers: githubHeaders(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({ query: body.query, variables: body.variables }),
    }, proxy);
  });

  app.post('/api/nostar/proxy/github-raw', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const token = await githubTokenFor(services, user.id);
    const proxy = await userProxyConfig(services, user.id);
    const target = new URL(text(asRecord(request.body).url));
    if (target.protocol !== 'https:' || !['gist.githubusercontent.com', 'raw.githubusercontent.com'].includes(target.hostname)) {
      return reply.status(400).send({ error: 'Invalid GitHub raw URL', code: 'INVALID_GITHUB_RAW_URL' });
    }
    const response = await externalRequest(target.toString(), {
      method: 'GET',
      headers: githubHeaders(token),
      timeout: 60000,
      responseType: 'text',
    }, proxy);
    return reply.status(response.status).type(text(response.headers['content-type']) || 'text/plain; charset=utf-8').send(text(response.data));
  });

  app.post('/api/nostar/proxy/github/*', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const token = await githubTokenFor(services, user.id);
    const proxy = await userProxyConfig(services, user.id);
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
      body: method === 'GET' || input.body === undefined
        ? undefined
        : typeof input.body === 'string' ? input.body : JSON.stringify(input.body),
    }, proxy);
  });

  app.post('/api/nostar/proxy/ai', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const proxy = await userProxyConfig(services, user.id);
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
    }, proxy);
  });

  app.post('/api/nostar/proxy/webdav', { bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const proxy = await userProxyConfig(services, user.id);
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
    const response = await externalRequest(targetUrl.toString(), {
      method,
      headers: headers as Record<string, string>,
      data: ['GET', 'HEAD'].includes(method) ? undefined : typeof input.body === 'string' ? input.body : undefined,
      timeout: 60000,
      responseType: 'text',
    }, proxy);
    return reply.status(response.status).type(text(response.headers['content-type']) || 'text/plain; charset=utf-8').send(text(response.data));
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

async function proxyJson(reply: FastifyReply, url: string, init: RequestInit, proxy?: RuntimeProxyConfig | null) {
  const response = await externalRequest(url, {
    method: init.method,
    headers: normalizeHeaders(init.headers),
    data: init.body,
    signal: init.signal || undefined,
    timeout: init.signal ? 0 : 120000,
    responseType: 'text',
  }, proxy);
  const contentType = text(response.headers['content-type']) || 'application/json; charset=utf-8';
  return reply.status(response.status).type(contentType).send(text(response.data));
}

type RuntimeProxyConfig = {
  enabled: boolean;
  type: 'http' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
};

type RuntimeRpcConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secret?: string;
};

async function storedConfig(services: AppServices, userId: number, key: string): Promise<AnyRecord> {
  const row = await services.prisma.noStarSetting.findUnique({ where: { userId_key: { userId, key } } });
  if (!row) return {};
  if (typeof row.value === 'string') {
    try {
      return asRecord(JSON.parse(row.value));
    } catch {
      return {};
    }
  }
  return asRecord(row.value);
}

async function saveStoredConfig(services: AppServices, userId: number, key: string, value: AnyRecord) {
  await services.prisma.noStarSetting.upsert({
    where: { userId_key: { userId, key } },
    update: { value: normalizeJson(value) },
    create: { userId, key, value: normalizeJson(value) },
  });
}

function publicProxyConfig(value: AnyRecord) {
  return {
    enabled: Boolean(value.enabled),
    type: value.type === 'socks5' ? 'socks5' : 'http',
    host: text(value.host),
    port: boundedInt(value.port, 7890, 1, 65535),
    username: text(value.username) || undefined,
    hasPassword: Boolean(value.passwordEncrypted),
  };
}

function proxyConfigForStorage(input: AnyRecord, existing: AnyRecord, encryptionKey: string) {
  const passwordProvided = Object.prototype.hasOwnProperty.call(input, 'password');
  const rawPassword = text(input.password);
  return {
    enabled: Boolean(input.enabled),
    type: input.type === 'socks5' ? 'socks5' : 'http',
    host: validNetworkHost(input.host),
    port: boundedInt(input.port, 7890, 1, 65535),
    username: nullableText(input.username),
    passwordEncrypted: passwordProvided
      ? rawPassword.startsWith('***') ? nullableText(existing.passwordEncrypted)
        : rawPassword ? encryptSecret(rawPassword, encryptionKey) : null
      : nullableText(existing.passwordEncrypted),
  };
}

function proxyConfigForRequest(input: AnyRecord, existing: AnyRecord, encryptionKey: string): RuntimeProxyConfig {
  const source = Object.keys(input).length ? input : existing;
  const inputPassword = text(input.password);
  const encrypted = nullableText(existing.passwordEncrypted);
  return {
    enabled: source.enabled !== false,
    type: source.type === 'socks5' ? 'socks5' : 'http',
    host: validNetworkHost(source.host),
    port: boundedInt(source.port, 7890, 1, 65535),
    username: text(source.username) || undefined,
    password: inputPassword && !inputPassword.startsWith('***')
      ? inputPassword
      : encrypted ? decryptSecret(encrypted, encryptionKey) : undefined,
  };
}

async function userProxyConfig(services: AppServices, userId: number): Promise<RuntimeProxyConfig | null> {
  const stored = await storedConfig(services, userId, PROXY_SETTING_KEY);
  if (!stored.enabled) return null;
  return proxyConfigForRequest({}, stored, services.encryptionKey);
}

async function exportNoStarData(services: AppServices, userId: number) {
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

async function importNoStarData(services: AppServices, userId: number, data: AnyRecord) {
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

function maskSettingValue(key: string, value: unknown, encryptionKey: string) {
  const config = asRecord(value);
  if (key === PROXY_SETTING_KEY) {
    return { ...publicProxyConfig(config), password: config.passwordEncrypted ? maskSecret(decryptSecret(text(config.passwordEncrypted), encryptionKey)) : '' };
  }
  if (key === RPC_SETTING_KEY) {
    return { ...publicRpcConfig(config), secret: config.secretEncrypted ? maskSecret(decryptSecret(text(config.secretEncrypted), encryptionKey)) : '' };
  }
  return normalizeJson(value);
}

function publicRpcConfig(value: AnyRecord) {
  return {
    enabled: Boolean(value.enabled),
    host: text(value.host),
    port: boundedInt(value.port, 6800, 1, 65535),
    hasSecret: Boolean(value.secretEncrypted),
  };
}

function rpcConfigForStorage(input: AnyRecord, existing: AnyRecord, encryptionKey: string) {
  const secretProvided = Object.prototype.hasOwnProperty.call(input, 'secret');
  const rawSecret = text(input.secret);
  return {
    enabled: Boolean(input.enabled),
    host: validNetworkHost(input.host),
    port: boundedInt(input.port, 6800, 1, 65535),
    secretEncrypted: secretProvided
      ? rawSecret.startsWith('***') ? nullableText(existing.secretEncrypted)
        : rawSecret ? encryptSecret(rawSecret, encryptionKey) : null
      : nullableText(existing.secretEncrypted),
  };
}

function rpcConfigForRequest(input: AnyRecord, existing: AnyRecord, encryptionKey: string): RuntimeRpcConfig {
  const source = Object.keys(input).length ? input : existing;
  const inputSecret = text(input.secret);
  const encrypted = nullableText(existing.secretEncrypted);
  return {
    enabled: source.enabled !== false,
    host: validNetworkHost(source.host),
    port: boundedInt(source.port, 6800, 1, 65535),
    secret: inputSecret && !inputSecret.startsWith('***')
      ? inputSecret
      : encrypted ? decryptSecret(encrypted, encryptionKey) : undefined,
  };
}

async function callAria2(config: RuntimeRpcConfig, method: string, params: unknown[], id: string) {
  try {
    const rpcParams = config.secret ? [`token:${config.secret}`, ...params] : params;
    const response = await fetch(`http://${config.host}:${config.port}/jsonrpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: rpcParams }),
      signal: AbortSignal.timeout(method === 'aria2.addUri' ? 10000 : 5000),
    });
    const data = asRecord(await response.json());
    if (!response.ok) return { success: false, error: `aria2 returned HTTP ${response.status}` };
    if (data.error) return { success: false, error: text(asRecord(data.error).message) || 'RPC error' };
    return method === 'aria2.getVersion'
      ? { success: true, version: text(asRecord(data.result).version) || undefined }
      : { success: true, gid: text(data.result) || undefined };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

async function externalRequest(url: string, config: AxiosRequestConfig, proxy?: RuntimeProxyConfig | null) {
  const request: AxiosRequestConfig = { ...config, url, validateStatus: () => true, maxContentLength: 50 * 1024 * 1024 };
  if (proxy?.enabled) {
    if (proxy.type === 'socks5') {
      const auth = proxy.username
        ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@`
        : '';
      const agent = new SocksProxyAgent(`socks5://${auth}${proxy.host}:${proxy.port}`);
      request.httpAgent = agent;
      request.httpsAgent = agent;
      request.proxy = false;
    } else {
      request.proxy = {
        protocol: 'http',
        host: proxy.host,
        port: proxy.port,
        auth: proxy.username ? { username: proxy.username, password: proxy.password || '' } : undefined,
      };
    }
  } else {
    request.proxy = false;
  }
  return axios(request);
}

function normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

function validNetworkHost(value: unknown) {
  const host = text(value).trim();
  if (!host) return '';
  if (!/^[a-zA-Z0-9._:[\]-]+$/.test(host) || host.includes('..')) {
    throw Object.assign(new Error('Invalid host'), { statusCode: 400 });
  }
  return host;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'Connection timeout';
    if (error.code === 'ECONNREFUSED') return 'Connection refused';
  }
  return error instanceof Error ? error.message : 'Request failed';
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

function arrayValue(value: unknown) {
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
