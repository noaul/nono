import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { decryptSecret } from '../../utils/crypto.js';
import { asRecord, authed, nullableText, text } from './common.js';
import {
  aiTarget,
  githubHeaders,
  githubTokenFor,
  outboundRequest,
  proxyJson,
  userProxyConfig,
} from './network.js';

export function registerNoStarProxyRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/nostar/proxy/github/graphql', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const token = await githubTokenFor(services, user.id);
    const proxy = await userProxyConfig(services, user);
    const body = asRecord(request.body);
    if (!body.query) return reply.status(400).send({ error: 'query required', code: 'QUERY_REQUIRED' });
    return proxyJson(reply, services, user, 'https://api.github.com/graphql', {
      method: 'POST',
      headers: githubHeaders(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({ query: body.query, variables: body.variables }),
    }, proxy);
  });

  app.post('/api/nostar/proxy/github-raw', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const token = await githubTokenFor(services, user.id);
    const proxy = await userProxyConfig(services, user);
    const target = new URL(text(asRecord(request.body).url));
    if (target.protocol !== 'https:' || !['gist.githubusercontent.com', 'raw.githubusercontent.com'].includes(target.hostname)) {
      return reply.status(400).send({ error: 'Invalid GitHub raw URL', code: 'INVALID_GITHUB_RAW_URL' });
    }
    const response = await outboundRequest(services, user, target.toString(), {
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
    const proxy = await userProxyConfig(services, user);
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
    return proxyJson(reply, services, user, `https://api.github.com/${suffix}`, {
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
    const proxy = await userProxyConfig(services, user);
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
    return proxyJson(reply, services, user, target.url, {
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
    const proxy = await userProxyConfig(services, user);
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
    const response = await outboundRequest(services, user, targetUrl.toString(), {
      method,
      headers: headers as Record<string, string>,
      data: ['GET', 'HEAD'].includes(method) ? undefined : typeof input.body === 'string' ? input.body : undefined,
      timeout: 60000,
      responseType: 'text',
    }, proxy);
    return reply.status(response.status).type(text(response.headers['content-type']) || 'text/plain; charset=utf-8').send(text(response.data));
  });
}
