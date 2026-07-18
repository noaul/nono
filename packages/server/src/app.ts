import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { authRoutes } from './routes/auth.js';
import { navigationRoutes } from './routes/navigation.js';
import { faviconRoutes } from './routes/favicon.js';
import { siteRoutes } from './routes/admin/site.js';
import { folderRoutes } from './routes/admin/folders.js';
import { linkRoutes } from './routes/admin/links.js';
import { bookmarkRoutes } from './routes/admin/bookmarks.js';
import { tokenRoutes } from './routes/admin/tokens.js';
import { userRoutes } from './routes/admin/users.js';
import { accountRoutes } from './routes/admin/account.js';
import { metaRoutes } from './routes/admin/meta.js';
import { aiRoutes } from './routes/ai.js';
import { nodeskRoutes } from './routes/nodesk.js';
import { nostarRoutes } from './routes/nostar.js';
import { passkeyRoutes } from './routes/passkeys.js';
import { backupRoutes } from './routes/admin/backups.js';
import { notificationRoutes } from './routes/admin/notifications.js';
import { responsePlugin, sendError, sendOk } from './plugins/responses.js';
import { createPrismaRepository } from './services/prisma.repository.js';
import type { AppServices, LlmClient } from './types.js';
import { fetchPublicResource, requestSafeResource, resolvePublicAddress } from './utils/safe-fetch.js';
import { defaultWebAuthnService } from './services/webauthn.service.js';
import { createBackupServiceFromEnv } from './services/backup.service.js';
import { registerLinkHealthScheduler } from './services/link-health.scheduler.js';
import { createNoMoneyDueReader, createNotificationService } from './services/notification.service.js';
import { NodeskContentStore } from './services/nodesk-content.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export async function buildApp(overrides: Partial<AppServices> = {}) {
  const prisma = overrides.prisma || new PrismaClient();
  const safeRequester = overrides.safeRequester || requestSafeResource;
  const nodeskContentDir = overrides.nodeskContentDir || process.env.NODESK_CONTENT_DIR || path.resolve(__dirname, '../../../apps/blog');
  const backupService = overrides.backupService || createBackupServiceFromEnv(nodeskContentDir);
  const nodeskStore = new NodeskContentStore(nodeskContentDir);
  const notificationService = overrides.notificationService || createNotificationService({
    prisma,
    nodeskReader: () => nodeskStore.readPublicJson('site'),
    noMoneyReader: createNoMoneyDueReader(process.env.NOMONEY_DATA_DIR || path.resolve(process.cwd(), '../nomoney-data')),
    backupService,
  });
  const services: AppServices = {
    prisma,
    repo: overrides.repo || createPrismaRepository(prisma),
    sessionSecret: overrides.sessionSecret || envOrThrow('SESSION_SECRET'),
    encryptionKey: resolveEncryptionKey(overrides.encryptionKey),
    nodeskContentDir,
    llmClient: overrides.llmClient || new FetchLlmClient(safeRequester),
    publicFetcher: overrides.publicFetcher || fetchPublicResource,
    publicAddressResolver: overrides.publicAddressResolver || resolvePublicAddress,
    safeRequester,
    privateOutboundHosts: overrides.privateOutboundHosts || parseHostList(process.env.PRIVATE_OUTBOUND_HOSTS),
    webAuthn: overrides.webAuthn || defaultWebAuthnService,
    webAuthnRpName: overrides.webAuthnRpName || process.env.WEBAUTHN_RP_NAME || 'Nono',
    webAuthnRpId: overrides.webAuthnRpId || process.env.WEBAUTHN_RP_ID || null,
    webAuthnOrigin: overrides.webAuthnOrigin || resolvePublicOrigin(process.env.WEBAUTHN_ORIGIN || process.env.NONO_PUBLIC_URL),
    backupService,
    notificationService,
  };

  const app = fastify({
    bodyLimit: 2 * 1024 * 1024,
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL || 'info' },
    trustProxy: '127.0.0.1',
  });

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: corsOriginPolicy(), credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await responsePlugin(app);

  app.get('/healthz', async (_request, reply) => sendOk(reply, { ok: true }));

  await authRoutes(app, services);
  await passkeyRoutes(app, services);
  await navigationRoutes(app, services);
  await faviconRoutes(app, services);
  await siteRoutes(app, services);
  await folderRoutes(app, services);
  await linkRoutes(app, services);
  await bookmarkRoutes(app, services);
  await tokenRoutes(app, services);
  await userRoutes(app, services);
  await accountRoutes(app, services);
  await backupRoutes(app, services);
  await notificationRoutes(app, services);
  await metaRoutes(app, services);
  await aiRoutes(app, services);
  await nodeskRoutes(app, services);
  await nostarRoutes(app, services);
  registerLinkHealthScheduler(app, services);

  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    const noStarIndex = path.join(webDist, 'nostar/index.html');
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return sendError(reply, 404, 'Not found');
      const pathname = request.url.split('?', 1)[0];
      if (pathname === '/nostar') return reply.redirect('/nostar/');
      if (request.url.startsWith('/nostar/') && fs.existsSync(noStarIndex)) {
        return reply.type('text/html; charset=utf-8').send(fs.readFileSync(noStarIndex, 'utf8'));
      }
      return reply.type('text/html; charset=utf-8').send(fs.readFileSync(path.join(webDist, 'index.html'), 'utf8'));
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return sendError(reply, 404, 'Not found');
      return sendError(reply, 404, 'Not found');
    });
  }

  return app;
}

function envOrThrow(name: string) {
  const value = process.env[name];
  if (value && value !== 'change-me-in-production') return value;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be configured in production`);
  return 'dev-only-session-secret-change-me';
}

function resolveEncryptionKey(override: string | undefined) {
  const value = override || process.env.ENCRYPTION_KEY || (process.env.NODE_ENV === 'production' ? '' : DEFAULT_ENCRYPTION_KEY);
  if (process.env.NODE_ENV === 'production' && (!value || value === DEFAULT_ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be configured in production');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters');
  }
  return value;
}

function corsOriginPolicy() {
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  return (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) => {
    const allowed = !origin || allowedOrigins.has(origin) || /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    callback(null, allowed);
  };
}

export class FetchLlmClient implements LlmClient {
  constructor(private readonly requester = requestSafeResource) {}

  async complete(input: Parameters<LlmClient['complete']>[0]) {
    if (input.provider === 'claude') return completeClaude(input, this.requester);
    return completeOpenAi(input, this.requester);
  }
}

async function completeOpenAi(input: Parameters<LlmClient['complete']>[0], requester = requestSafeResource) {
  const response = await requester(resolveLlmEndpoint(input.baseUrl, 'https://api.openai.com/v1', 'chat/completions'), {
    method: 'POST',
    headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      response_format: { type: 'json_object' },
      ...(supportsOpenAiReasoning(input.model, input.reasoningEffort) ? { reasoning_effort: input.reasoningEffort } : {}),
      messages: [
        { role: 'system', content: 'Return valid compact JSON only.' },
        { role: 'user', content: input.prompt },
      ],
    }),
    allowPrivateHosts: input.allowPrivateHosts,
    timeoutMs: 120000,
    maxBytes: 8 * 1024 * 1024,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`OpenAI request failed: ${response.statusCode}`);
  const payload = JSON.parse(response.body.toString('utf8')) as any;
  return payload.choices?.[0]?.message?.content || '{}';
}

async function completeClaude(input: Parameters<LlmClient['complete']>[0], requester = requestSafeResource) {
  const thinkingBudget = claudeThinkingBudget(input.reasoningEffort);
  const response = await requester(resolveLlmEndpoint(input.baseUrl, 'https://api.anthropic.com/v1', 'messages'), {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: thinkingBudget ? thinkingBudget + 1024 : 500,
      ...(thinkingBudget ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget } } : {}),
      system: 'Return valid compact JSON only.',
      messages: [{ role: 'user', content: input.prompt }],
    }),
    allowPrivateHosts: input.allowPrivateHosts,
    timeoutMs: 120000,
    maxBytes: 8 * 1024 * 1024,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Claude request failed: ${response.statusCode}`);
  const payload = JSON.parse(response.body.toString('utf8')) as any;
  return payload.content?.find((item: any) => item.type === 'text')?.text || '{}';
}

function resolveLlmEndpoint(baseUrl: string | null | undefined, officialBaseUrl: string, endpoint: string) {
  const base = (baseUrl || officialBaseUrl).replace(/\/+$/, '');
  if (base.endsWith(`/${endpoint}`)) return base;
  return `${base}/${endpoint}`;
}

function supportsOpenAiReasoning(model: string, effort: string | null | undefined) {
  return Boolean(effort && effort !== 'none' && /^(o[1-9]|gpt-5)/i.test(model));
}

function claudeThinkingBudget(effort: string | null | undefined) {
  if (effort === 'low') return 1024;
  if (effort === 'medium') return 2048;
  if (effort === 'high') return 4096;
  return 0;
}

function parseHostList(value: string | undefined) {
  return (value || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
}

function resolvePublicOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    throw new Error('WEBAUTHN_ORIGIN or NONO_PUBLIC_URL must be a valid URL');
  }
}
