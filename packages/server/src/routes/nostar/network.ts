import type { FastifyReply } from 'fastify';
import axios, { type AxiosRequestConfig } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { AppServices, AuthUser } from '../../types.js';
import { decryptSecret, encryptSecret } from '../../utils/crypto.js';
import {
  PROXY_SETTING_KEY,
  RPC_SETTING_KEY,
  asRecord,
  boundedInt,
  maskSecret,
  normalizeJson,
  nullableText,
  text,
  type AnyRecord,
} from './common.js';

export type RuntimeProxyConfig = {
  enabled: boolean;
  type: 'http' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
};

export type RuntimeRpcConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secret?: string;
};

export async function githubTokenFor(services: AppServices, userId: number) {
  const account = await services.prisma.noStarAccount.findUnique({ where: { userId } });
  if (!account?.githubTokenEncrypted) {
    throw Object.assign(new Error('GitHub token not configured'), { statusCode: 400, code: 'GITHUB_TOKEN_NOT_CONFIGURED' });
  }
  return decryptSecret(account.githubTokenEncrypted, services.encryptionKey);
}

export function githubHeaders(token: string, extra: AnyRecord = {}) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'NoStar-Nono',
    'x-github-api-version': '2022-11-28',
    ...extra,
  } as Record<string, string>;
}

export async function proxyJson(
  reply: FastifyReply,
  services: AppServices,
  user: AuthUser,
  url: string,
  init: RequestInit,
  proxy?: RuntimeProxyConfig | null,
) {
  const response = await outboundRequest(services, user, url, {
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

export async function storedConfig(services: AppServices, userId: number, key: string): Promise<AnyRecord> {
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

export async function saveStoredConfig(services: AppServices, userId: number, key: string, value: AnyRecord) {
  await services.prisma.noStarSetting.upsert({
    where: { userId_key: { userId, key } },
    update: { value: normalizeJson(value) },
    create: { userId, key, value: normalizeJson(value) },
  });
}

export function publicProxyConfig(value: AnyRecord) {
  return {
    enabled: Boolean(value.enabled),
    type: value.type === 'socks5' ? 'socks5' : 'http',
    host: text(value.host),
    port: boundedInt(value.port, 7890, 1, 65535),
    username: text(value.username) || undefined,
    hasPassword: Boolean(value.passwordEncrypted),
  };
}

export function proxyConfigForStorage(input: AnyRecord, existing: AnyRecord, encryptionKey: string) {
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

export function proxyConfigForRequest(input: AnyRecord, existing: AnyRecord, encryptionKey: string): RuntimeProxyConfig {
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

export async function userProxyConfig(services: AppServices, user: AuthUser): Promise<RuntimeProxyConfig | null> {
  if (user.role !== 'admin') return null;
  const stored = await storedConfig(services, user.id, PROXY_SETTING_KEY);
  if (!stored.enabled) return null;
  return proxyConfigForRequest({}, stored, services.encryptionKey);
}

export function maskSettingValue(key: string, value: unknown, encryptionKey: string) {
  const config = asRecord(value);
  if (key === PROXY_SETTING_KEY) {
    return { ...publicProxyConfig(config), password: config.passwordEncrypted ? maskSecret(decryptSecret(text(config.passwordEncrypted), encryptionKey)) : '' };
  }
  if (key === RPC_SETTING_KEY) {
    return { ...publicRpcConfig(config), secret: config.secretEncrypted ? maskSecret(decryptSecret(text(config.secretEncrypted), encryptionKey)) : '' };
  }
  return normalizeJson(value);
}

export function publicRpcConfig(value: AnyRecord) {
  return {
    enabled: Boolean(value.enabled),
    host: text(value.host),
    port: boundedInt(value.port, 6800, 1, 65535),
    hasSecret: Boolean(value.secretEncrypted),
  };
}

export function rpcConfigForStorage(input: AnyRecord, existing: AnyRecord, encryptionKey: string) {
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

export function rpcConfigForRequest(input: AnyRecord, existing: AnyRecord, encryptionKey: string): RuntimeRpcConfig {
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

export async function callAria2(
  services: AppServices,
  user: AuthUser,
  config: RuntimeRpcConfig,
  method: string,
  params: unknown[],
  id: string,
) {
  try {
    const rpcParams = config.secret ? [`token:${config.secret}`, ...params] : params;
    const response = await services.safeRequester(`http://${config.host}:${config.port}/jsonrpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: rpcParams }),
      signal: AbortSignal.timeout(method === 'aria2.addUri' ? 10000 : 5000),
      timeoutMs: method === 'aria2.addUri' ? 10000 : 5000,
      maxBytes: 1024 * 1024,
      allowPrivateHosts: privateHostsFor(user, services),
    });
    const data = asRecord(JSON.parse(response.body.toString('utf8')));
    if (response.statusCode < 200 || response.statusCode >= 300) return { success: false, error: `aria2 returned HTTP ${response.statusCode}` };
    if (data.error) return { success: false, error: text(asRecord(data.error).message) || 'RPC error' };
    return method === 'aria2.getVersion'
      ? { success: true, version: text(asRecord(data.result).version) || undefined }
      : { success: true, gid: text(data.result) || undefined };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function outboundRequest(
  services: AppServices,
  user: AuthUser,
  url: string,
  config: AxiosRequestConfig,
  proxy?: RuntimeProxyConfig | null,
) {
  if (proxy?.enabled) return externalRequest(url, config, proxy);
  const response = await services.safeRequester(url, {
    method: String(config.method || 'GET'),
    headers: config.headers as Record<string, string> | undefined,
    body: typeof config.data === 'string' || Buffer.isBuffer(config.data) ? config.data : undefined,
    timeoutMs: config.timeout && config.timeout > 0 ? config.timeout : 120000,
    maxBytes: typeof config.maxContentLength === 'number' && config.maxContentLength > 0 ? config.maxContentLength : 50 * 1024 * 1024,
    signal: config.signal as AbortSignal | undefined,
    allowPrivateHosts: privateHostsFor(user, services),
  });
  return { status: response.statusCode, headers: response.headers, data: response.body.toString('utf8') };
}

export function privateHostsFor(user: AuthUser, services: AppServices) {
  return user.role === 'admin' ? services.privateOutboundHosts : [];
}

export async function externalRequest(url: string, config: AxiosRequestConfig, proxy?: RuntimeProxyConfig | null) {
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

export function validNetworkHost(value: unknown) {
  const host = text(value).trim();
  if (!host) return '';
  if (!/^[a-zA-Z0-9._:[\]-]+$/.test(host) || host.includes('..')) {
    throw Object.assign(new Error('Invalid host'), { statusCode: 400 });
  }
  return host;
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'Connection timeout';
    if (error.code === 'ECONNREFUSED') return 'Connection refused';
  }
  return error instanceof Error ? error.message : 'Request failed';
}

export function aiTarget(input: { apiType: string; baseUrl: string; apiKey: string; model: string }) {
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

export function aiTestBody(apiType: string, model: string) {
  if (apiType === 'claude') return { model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK.' }] };
  if (apiType === 'gemini') return { contents: [{ parts: [{ text: 'Reply OK.' }] }] };
  if (apiType === 'openai-responses') return { model, max_output_tokens: 8, input: 'Reply OK.' };
  return { model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK.' }] };
}

function normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

function appendApiPath(baseUrl: string, path: string) {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith(`/${path}`)) return normalized;
  const [version, ...rest] = path.split('/');
  if (rest.length > 0 && normalized.toLowerCase().endsWith(`/${version.toLowerCase()}`)) {
    return `${normalized}/${rest.join('/')}`;
  }
  return `${normalized}/${path}`;
}
