import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
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
import { responsePlugin, sendError, sendOk } from './plugins/responses.js';
import { createPrismaRepository } from './services/prisma.repository.js';
import type { AppServices, LlmClient } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(overrides: Partial<AppServices> = {}) {
  const services: AppServices = {
    repo: overrides.repo || createPrismaRepository(),
    sessionSecret: overrides.sessionSecret || envOrThrow('SESSION_SECRET'),
    encryptionKey: overrides.encryptionKey || process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    llmClient: overrides.llmClient || new FetchLlmClient(),
  };

  const app = fastify({
    bodyLimit: 2 * 1024 * 1024,
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL || 'info' },
  });

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await responsePlugin(app);

  app.get('/healthz', async (_request, reply) => sendOk(reply, { ok: true }));

  await authRoutes(app, services);
  await navigationRoutes(app, services);
  await faviconRoutes(app);
  await siteRoutes(app, services);
  await folderRoutes(app, services);
  await linkRoutes(app, services);
  await bookmarkRoutes(app, services);
  await tokenRoutes(app, services);
  await userRoutes(app, services);
  await accountRoutes(app, services);
  await metaRoutes(app, services);
  await aiRoutes(app, services);

  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return sendError(reply, 404, 'Not found');
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

export class FetchLlmClient implements LlmClient {
  async complete(input: Parameters<LlmClient['complete']>[0]) {
    if (input.provider === 'claude') return completeClaude(input);
    return completeOpenAi(input);
  }
}

async function completeOpenAi(input: Parameters<LlmClient['complete']>[0]) {
  const response = await fetch(resolveLlmEndpoint(input.baseUrl, 'https://api.openai.com/v1', 'chat/completions'), {
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
  });
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const payload = (await response.json()) as any;
  return payload.choices?.[0]?.message?.content || '{}';
}

async function completeClaude(input: Parameters<LlmClient['complete']>[0]) {
  const thinkingBudget = claudeThinkingBudget(input.reasoningEffort);
  const response = await fetch(resolveLlmEndpoint(input.baseUrl, 'https://api.anthropic.com/v1', 'messages'), {
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
  });
  if (!response.ok) throw new Error(`Claude request failed: ${response.status}`);
  const payload = (await response.json()) as any;
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
