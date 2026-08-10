import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { decryptSecret, encryptSecret } from '../../utils/crypto.js';
import {
  DEBUG_SETTING_KEY,
  PROXY_SETTING_KEY,
  RPC_SETTING_KEY,
  adminOnly,
  asRecord,
  authed,
  maskSecret,
  normalizeJson,
  text,
} from './common.js';
import {
  callAria2,
  errorMessage,
  externalRequest,
  isHttpUrl,
  maskSettingValue,
  proxyConfigForRequest,
  proxyConfigForStorage,
  publicProxyConfig,
  publicRpcConfig,
  rpcConfigForRequest,
  rpcConfigForStorage,
  saveStoredConfig,
  storedConfig,
} from './network.js';

export function registerNoStarSettingsRoutes(app: FastifyInstance, services: AppServices) {
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
    if (user.role !== 'admin' && [PROXY_SETTING_KEY, RPC_SETTING_KEY].some((key) => key in updates)) {
      return reply.status(403).send({ error: 'Administrator access required', code: 'ADMIN_REQUIRED' });
    }
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
    const user = await adminOnly(request, reply, services);
    if (!user) return;
    return publicProxyConfig(await storedConfig(services, user.id, PROXY_SETTING_KEY));
  });

  app.put('/api/nostar/settings/proxy', async (request, reply) => {
    const user = await adminOnly(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const existing = await storedConfig(services, user.id, PROXY_SETTING_KEY);
    const config = proxyConfigForStorage(input, existing, services.encryptionKey);
    await saveStoredConfig(services, user.id, PROXY_SETTING_KEY, config);
    return { success: true };
  });

  app.post('/api/nostar/settings/proxy/test', async (request, reply) => {
    const user = await adminOnly(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const existing = await storedConfig(services, user.id, PROXY_SETTING_KEY);
    try {
      const config = proxyConfigForRequest(input, existing, services.encryptionKey);
      if (!config.host || !config.port) return { success: false, error: 'Host and port are required' };
      const response = await externalRequest('https://api.github.com/rate_limit', {
        method: 'GET',
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'NoStar-NoNo' },
        timeout: 10000,
      }, config);
      return { success: response.status >= 200 && response.status < 500, status: response.status };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  });

  app.get('/api/nostar/settings/rpc-download', async (request, reply) => {
    const user = await adminOnly(request, reply, services);
    if (!user) return;
    return publicRpcConfig(await storedConfig(services, user.id, RPC_SETTING_KEY));
  });

  app.put('/api/nostar/settings/rpc-download', async (request, reply) => {
    const user = await adminOnly(request, reply, services);
    if (!user) return;
    const input = asRecord(request.body);
    const existing = await storedConfig(services, user.id, RPC_SETTING_KEY);
    const config = rpcConfigForStorage(input, existing, services.encryptionKey);
    await saveStoredConfig(services, user.id, RPC_SETTING_KEY, config);
    return { success: true };
  });

  app.post('/api/nostar/settings/rpc-download/test', async (request, reply) => {
    const user = await adminOnly(request, reply, services);
    if (!user) return;
    const existing = await storedConfig(services, user.id, RPC_SETTING_KEY);
    const config = rpcConfigForRequest(asRecord(request.body), existing, services.encryptionKey);
    if (!config.host || !config.port) return { success: false, error: 'Host and port are required' };
    return callAria2(services, user, config, 'aria2.getVersion', [], 'test');
  });

  app.post('/api/nostar/download/rpc', async (request, reply) => {
    const user = await adminOnly(request, reply, services);
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
    return callAria2(services, user, config, 'aria2.addUri', [[url], ...options], 'download');
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
}
