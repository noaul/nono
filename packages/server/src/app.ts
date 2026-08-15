import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
import { clipperRoutes } from './routes/clipper.js';
import { passkeyRoutes } from './routes/passkeys.js';
import { backupRoutes } from './routes/admin/backups.js';
import { backupCenterRoutes } from './routes/admin/backup-center.js';
import { notificationRoutes } from './routes/admin/notifications.js';
import { auditRoutes } from './routes/admin/audit.js';
import { trashRoutes } from './routes/admin/trash.js';
import { responsePlugin, sendError, sendOk } from './plugins/responses.js';
import { registerAuditHooks } from './plugins/audit.js';
import { createPrismaRepository } from './services/prisma.repository.js';
import type { AppServices, LlmClient, ReadinessChecks } from './types.js';
import { fetchPublicResource, requestSafeResource, resolvePublicAddress } from './utils/safe-fetch.js';
import { defaultWebAuthnService } from './services/webauthn.service.js';
import { createBackupServiceFromEnv, type BackupRecord, type BackupService } from './services/backup.service.js';
import { createBackupAutomationService } from './services/backup-automation.service.js';
import { registerBackupAutomationScheduler } from './services/backup-automation.scheduler.js';
import { registerLinkHealthScheduler } from './services/link-health.scheduler.js';
import { createNoMoneyDueReader, createNotificationService, createYumiDueReader } from './services/notification.service.js';
import { NodeskContentStore } from './services/nodesk-content.service.js';
import { createAuditLogService } from './services/audit.service.js';
import { createNoMoneyClient } from './services/nomoney-client.js';
import { createBackupCenterService, type BackupBatchManifest, type BackupCenterService } from './services/backup-center.service.js';
import { createBackupModuleAdapters } from './services/backup-module-adapters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export async function buildApp(overrides: Partial<AppServices> = {}) {
  const prisma = overrides.prisma || new PrismaClient();
  const repo = overrides.repo || createPrismaRepository(prisma);
  const safeRequester = overrides.safeRequester || requestSafeResource;
  const nodeskContentDir = overrides.nodeskContentDir || process.env.NODESK_CONTENT_DIR || path.resolve(__dirname, '../../../apps/blog');
  const encryptionKey = resolveEncryptionKey(overrides.encryptionKey);
  const privateOutboundHosts = overrides.privateOutboundHosts || parseHostList(process.env.PRIVATE_OUTBOUND_HOSTS);
  const backupService = overrides.backupService || createBackupServiceFromEnv(nodeskContentDir);
  const backupCenterService = overrides.backupCenterService || createBackupCenterService({
    repo,
    encryptionKey,
    sourceCommit: process.env.NONO_BUILD_COMMIT || 'unknown',
    adapters: createBackupModuleAdapters({ prisma, encryptionKey, nodeskContentDir }),
    request: safeRequester,
    allowPrivateHosts: privateOutboundHosts,
  });
  const backupAutomationService = overrides.backupAutomationService || createBackupAutomationService({
    repo,
    backupService: overrides.backupService ? backupService : webDavAutomationTarget(backupCenterService, prisma),
  });
  const auditLogService = overrides.auditLogService || createAuditLogService(repo);
  const nodeskStore = new NodeskContentStore(nodeskContentDir);
  const notificationService = overrides.notificationService || createNotificationService({
    prisma,
    nodeskReader: () => nodeskStore.readPublicJson('site'),
    noMoneyReader: createNoMoneyDueReader(process.env.NOMONEY_DATA_DIR || path.resolve(process.cwd(), '../nomoney-data')),
    yumiReader: createYumiDueReader(process.env.YUMI_DATA_DIR || path.resolve(process.cwd(), '../yumi-data')),
    backupService,
    backupAutomationService,
  });
  const services: AppServices = {
    prisma,
    repo,
    sessionSecret: resolveSessionSecret(overrides.sessionSecret),
    encryptionKey,
    nodeskContentDir,
    llmClient: overrides.llmClient || new FetchLlmClient(safeRequester),
    publicFetcher: overrides.publicFetcher || fetchPublicResource,
    publicAddressResolver: overrides.publicAddressResolver || resolvePublicAddress,
    safeRequester,
    privateOutboundHosts,
    webAuthn: overrides.webAuthn || defaultWebAuthnService,
    webAuthnRpName: overrides.webAuthnRpName || process.env.WEBAUTHN_RP_NAME || 'NoNo',
    webAuthnRpId: overrides.webAuthnRpId || process.env.WEBAUTHN_RP_ID || null,
    webAuthnOrigin: overrides.webAuthnOrigin || resolvePublicOrigin(process.env.WEBAUTHN_ORIGIN || process.env.NONO_PUBLIC_URL),
    backupService,
    backupAutomationService,
    backupCenterService,
    auditLogService,
    notificationService,
    noMoneyClient: overrides.noMoneyClient || createNoMoneyClient({
      port: Number(process.env.YUMI_INTERNAL_PORT || 2040),
      serviceName: 'Yumi',
    }),
    readinessCheck: overrides.readinessCheck || createReadinessCheck(prisma, nodeskStore),
  };

  const app = fastify({
    bodyLimit: 2 * 1024 * 1024,
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL || 'info' },
    trustProxy: '127.0.0.1',
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'https:', 'http:', 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: null,
        workerSrc: ["'self'", 'blob:'],
      },
    },
  });
  await app.register(cors, { origin: corsOriginPolicy(), credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await responsePlugin(app);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (!request.url.startsWith('/api/')) return;

    const unsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const bearerRequest = /^Bearer\s+/i.test(request.headers.authorization || '');
    if (unsafeMethod && !bearerRequest && request.cookies.nono_session) {
      const origin = request.headers.origin;
      if (services.webAuthnOrigin && origin !== services.webAuthnOrigin) {
        return sendError(reply, 403, 'Request origin is not allowed');
      }
      if (request.headers['sec-fetch-site'] === 'cross-site') {
        return sendError(reply, 403, 'Cross-site request blocked');
      }
    }
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/') && !reply.hasHeader('cache-control')) {
      reply.header('Cache-Control', 'no-store');
    }
    return payload;
  });
  registerAuditHooks(app, services);

  const sendLive = async (_request: unknown, reply: Parameters<typeof sendOk>[0]) => sendOk(reply, { ok: true });
  app.get('/livez', sendLive);
  app.get('/healthz', sendLive);
  app.get('/readyz', async (_request, reply) => {
    const checks = await services.readinessCheck();
    const ok = Object.values(checks).every(Boolean);
    if (!ok) reply.status(503);
    return reply.send({ code: ok ? 0 : 503, data: { ok, checks }, message: ok ? '' : 'Service is not ready' });
  });

  await authRoutes(app, services);
  await passkeyRoutes(app, services);
  await navigationRoutes(app, services);
  await faviconRoutes(app, services);
  await siteRoutes(app, services);
  await folderRoutes(app, services);
  await linkRoutes(app, services);
  await trashRoutes(app, services);
  await bookmarkRoutes(app, services);
  await tokenRoutes(app, services);
  await userRoutes(app, services);
  await accountRoutes(app, services);
  await backupRoutes(app, services);
  await backupCenterRoutes(app, services);
  await notificationRoutes(app, services);
  await auditRoutes(app, services);
  await metaRoutes(app, services);
  await aiRoutes(app, services);
  await nodeskRoutes(app, services);
  await nostarRoutes(app, services);
  await clipperRoutes(app, services);
  registerLinkHealthScheduler(app, services);
  registerBackupAutomationScheduler(app, services);

  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    const noStarIndexPath = path.join(webDist, 'nostar/index.html');
    const clipperIndexPath = path.join(webDist, 'clipper/index.html');
    // 构建产物在进程生命周期内不会变化，启动时读入内存，避免每个 SPA 请求都同步读盘。
    const indexHtml = fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');
    const noStarHtml = fs.existsSync(noStarIndexPath) ? fs.readFileSync(noStarIndexPath, 'utf8') : null;
    const clipperHtml = fs.existsSync(clipperIndexPath) ? fs.readFileSync(clipperIndexPath, 'utf8') : null;
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return sendError(reply, 404, 'Not found');
      const pathname = request.url.split('?', 1)[0];
      if (pathname === '/nostar') return reply.redirect('/nostar/');
      if (noStarHtml && request.url.startsWith('/nostar/')) {
        return reply.type('text/html; charset=utf-8').send(noStarHtml);
      }
      if (pathname === '/clipper') return reply.redirect('/clipper/');
      if (clipperHtml && request.url.startsWith('/clipper/')) {
        return reply.type('text/html; charset=utf-8').send(clipperHtml);
      }
      return reply.type('text/html; charset=utf-8').send(indexHtml);
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return sendError(reply, 404, 'Not found');
      return sendError(reply, 404, 'Not found');
    });
  }

  return app;
}

function createReadinessCheck(prisma: PrismaClient, nodeskStore: NodeskContentStore) {
  return async (): Promise<ReadinessChecks> => {
    const nomoneyPort = Number(process.env.NOMONEY_INTERNAL_PORT || 2030);
    const yumiPort = Number(process.env.YUMI_INTERNAL_PORT || 2040);
    const [postgres, nodesk, nomoney, yumi] = await Promise.allSettled([
      prisma.$queryRawUnsafe('SELECT 1'),
      nodeskStore.readPublicJson('site'),
      fetch(`http://127.0.0.1:${nomoneyPort}/api/readyz`, {
        signal: AbortSignal.timeout(2_000),
        redirect: 'error',
      }).then((response) => {
        if (!response.ok) throw new Error('NoMoney is not ready');
      }),
      fetch(`http://127.0.0.1:${yumiPort}/api/readyz`, {
        signal: AbortSignal.timeout(2_000),
        redirect: 'error',
      }).then((response) => {
        if (!response.ok) throw new Error('Yumi is not ready');
      }),
    ]);
    return {
      postgres: postgres.status === 'fulfilled',
      nodesk: nodesk.status === 'fulfilled',
      nomoney: nomoney.status === 'fulfilled',
      yumi: yumi.status === 'fulfilled',
    };
  };
}

function envOrThrow(name: string) {
  const value = process.env[name];
  if (value && value !== 'change-me-in-production') return value;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be configured in production`);
  return 'dev-only-session-secret-change-me';
}

function webDavAutomationTarget(center: BackupCenterService, prisma: PrismaClient): BackupService {
  async function adminUserId() {
    const user = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { id: 'asc' }, select: { id: true } });
    if (!user) throw Object.assign(new Error('An administrator account is required for automatic WebDAV backup'), { statusCode: 503 });
    return user.id;
  }
  const toRecord = (batch: BackupBatchManifest): BackupRecord => {
    const modules = Object.values(batch.modules).filter(Boolean);
    const serialized = JSON.stringify(batch);
    return {
      kind: 'nono.full-backup',
      version: 2,
      id: batch.id,
      filename: `${batch.id}.json`,
      createdAt: batch.createdAt,
      sourceCommit: batch.sourceCommit,
      size: modules.reduce((sum, item) => sum + Number(item?.size || 0), 0),
      sha256: createHash('sha256').update(serialized).digest('hex'),
      status: 'verified',
      components: ['postgres', 'nodesk', 'nomoney', 'yumi'],
      componentRecords: {},
    };
  };
  return {
    list: async () => (await center.getWebDavConfig()).passwordConfigured
      ? (await center.listWebDavBatches()).map(toRecord)
      : [],
    create: async () => toRecord(await center.backupToWebDav(await adminUserId())),
    remove: (id) => center.removeWebDavBatch(id),
    verify: async (id) => {
      const record = (await center.listWebDavBatches()).find((item) => item.id === id);
      if (!record) throw Object.assign(new Error('WebDAV backup not found'), { statusCode: 404 });
      return toRecord(record);
    },
    drill: async () => { throw Object.assign(new Error('WebDAV drill restore is not available through the legacy API'), { statusCode: 400 }); },
    restore: async () => { throw Object.assign(new Error('Use the backup center restore API'), { statusCode: 400 }); },
    resolveDownload: async () => { throw Object.assign(new Error('Use the backup center local download API'), { statusCode: 400 }); },
  };
}

function resolveSessionSecret(override: string | undefined) {
  const value = override || envOrThrow('SESSION_SECRET');
  if (process.env.NODE_ENV === 'production' && (
    value.length < 32
    || /(?:change[-_ ]?me|replace[-_ ]?with|example|dev(?:elopment)?[-_ ]only)/i.test(value)
  )) {
    throw new Error('SESSION_SECRET must be a non-placeholder value of at least 32 characters in production');
  }
  return value;
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
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WEBAUTHN_ORIGIN or NONO_PUBLIC_URL must be configured in production');
    }
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    throw new Error('WEBAUTHN_ORIGIN or NONO_PUBLIC_URL must be a valid URL');
  }
}
