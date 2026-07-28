import type { FastifyInstance } from 'fastify';
import { sendOk } from '../../plugins/responses.js';
import type { AppServices } from '../../types.js';
import { decryptSecret } from '../../utils/crypto.js';
import { isBearerRequest } from '../../plugins/auth.js';
import {
  arrayField,
  asRecord,
  authed,
  defaultVectorConfig,
  nextEncryptedSecret,
  replaceAiProfiles,
  replaceEmbeddingConfigs,
  replaceWebDavConfigs,
  revealSecret,
  text,
  vectorConfigData,
} from './common.js';
import { aiTarget, aiTestBody, privateHostsFor } from './network.js';

export function registerNoStarConfigRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/nostar/configs/ai', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const decrypt = asRecord(request.query).decrypt === 'true';
    if (decrypt && isBearerRequest(request)) return reply.status(403).send({ error: 'Bearer tokens cannot reveal stored secrets', code: 'SECRET_REVEAL_FORBIDDEN' });
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
    const response = await services.safeRequester(target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify(aiTestBody(apiType, model)),
      signal: AbortSignal.timeout(30000),
      timeoutMs: 30000,
      maxBytes: 1024 * 1024,
      allowPrivateHosts: privateHostsFor(user, services),
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Object.assign(new Error(`连接失败：HTTP ${response.statusCode}`), { statusCode: 400 });
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
    if (decrypt && isBearerRequest(request)) return reply.status(403).send({ error: 'Bearer tokens cannot reveal stored secrets', code: 'SECRET_REVEAL_FORBIDDEN' });
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
    if (decrypt && isBearerRequest(request)) return reply.status(403).send({ error: 'Bearer tokens cannot reveal stored secrets', code: 'SECRET_REVEAL_FORBIDDEN' });
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
    if (decrypt && isBearerRequest(request)) return reply.status(403).send({ error: 'Bearer tokens cannot reveal stored secrets', code: 'SECRET_REVEAL_FORBIDDEN' });
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
}
