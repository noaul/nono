import dns from 'node:dns/promises';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { AppContext } from './types.js';

export interface SafeResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  finalUrl?: string;
}

export interface SafeRequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  allowPrivateHosts?: string[];
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

type LookupAddress = { address: string; family: 4 | 6 };
type Lookup = (hostname: string) => Promise<LookupAddress[]>;
type Request = (url: URL, address: LookupAddress, options: SafeRequestOptions) => Promise<SafeResponse>;

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const) {
  blockedV4.addSubnet(network, prefix, 'ipv4');
}

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
blockedV6.addSubnet('2001:2::', 48, 'ipv6');
blockedV6.addSubnet('2001:db8::', 32, 'ipv6');

export async function requestSafeResource(
  rawUrl: string,
  options: SafeRequestOptions = {},
  dependencies: { lookup?: Lookup; request?: Request } = {}
): Promise<SafeResponse> {
  const lookup = dependencies.lookup ?? defaultLookup;
  const request = dependencies.request ?? requestOnce;
  const maxRedirects = options.maxRedirects ?? 3;
  let url = parsePublicUrl(rawUrl);
  let requestOptions: SafeRequestOptions = { ...options, method: (options.method ?? 'GET').toUpperCase() };

  for (let redirectCount = 0; ; redirectCount += 1) {
    assertSecureCredentialTransport(url, requestOptions);
    const address = await resolveRequestAddress(url.hostname, requestOptions.allowPrivateHosts ?? [], lookup);
    const response = await request(url, address, requestOptions);
    const location = firstHeader(response.headers.location);
    if (!isRedirect(response.statusCode) || !location) return { ...response, finalUrl: url.href };
    if (redirectCount >= maxRedirects) throw new Error('Too many redirects');
    const nextUrl = parsePublicUrl(new URL(location, url).href);
    requestOptions = redirectOptions(requestOptions, url, nextUrl);
    url = nextUrl;
  }
}

export async function requestOutbound(
  context: AppContext,
  rawUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  limits: { maxBytes?: number; maxRedirects?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const options: SafeRequestOptions = {
    ...init,
    ...limits,
    allowPrivateHosts: context.privateOutboundHosts ?? []
  };
  if (!context.fetch) {
    const result = await requestSafeResource(rawUrl, options);
    return toResponse(result);
  }
  return requestWithInjectedFetch(context.fetch, rawUrl, options);
}

async function resolveRequestAddress(hostname: string, allowPrivateHosts: string[], lookup: Lookup): Promise<LookupAddress> {
  const host = stripBrackets(hostname).toLowerCase();
  const allowlist = new Set(allowPrivateHosts.map((item) => stripBrackets(item.trim()).toLowerCase()).filter(Boolean));
  const literalFamily = isIP(host);
  const addresses = literalFamily
    ? [{ address: host, family: literalFamily as 4 | 6 }]
    : await lookup(host);
  if (!addresses.length) throw new Error('Target address could not be resolved');
  if (!allowlist.has(host) && addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Target address is not public');
  }
  return addresses[0];
}

function parsePublicUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only public HTTP and HTTPS URLs are allowed');
  }
  return url;
}

function isPublicAddress(rawAddress: string): boolean {
  const address = normalizeAddress(rawAddress);
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  if (family === 6) return globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
  return false;
}

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Target address is not public');
  }
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

function requestOnce(url: URL, address: LookupAddress, options: SafeRequestOptions): Promise<SafeResponse> {
  const transport = url.protocol === 'https:' ? https : http;
  const maxBytes = options.maxBytes ?? 512 * 1024;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return new Promise((resolve, reject) => {
    const request = transport.request({
      hostname: address.address,
      family: address.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method,
      servername: url.protocol === 'https:' && !isIP(stripBrackets(url.hostname)) ? url.hostname : undefined,
      headers: { ...(options.headers ?? {}), host: url.host }
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error('Response body is too large'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
      response.on('error', reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Request timed out')));
    request.on('error', reject);
    request.end(options.body);
  });
}

async function requestWithInjectedFetch(
  fetcher: typeof fetch,
  rawUrl: string,
  options: SafeRequestOptions
): Promise<Response> {
  let url = parsePublicUrl(rawUrl);
  let requestOptions = options;
  const maxRedirects = options.maxRedirects ?? 3;
  for (let redirectCount = 0; ; redirectCount += 1) {
    assertSecureCredentialTransport(url, requestOptions);
    validateInjectedTarget(url, options.allowPrivateHosts ?? []);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
    let response: Response;
    try {
      response = await fetcher(url, {
        method: requestOptions.method,
        headers: requestOptions.headers,
        body: requestOptions.body,
        redirect: 'manual',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    const location = response.headers.get('location');
    if (!isRedirect(response.status) || !location) {
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > (options.maxBytes ?? 512 * 1024)) throw new Error('Response body is too large');
      return new Response(toArrayBuffer(body), { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    if (redirectCount >= maxRedirects) throw new Error('Too many redirects');
    const nextUrl = parsePublicUrl(new URL(location, url).href);
    requestOptions = redirectOptions(requestOptions, url, nextUrl);
    url = nextUrl;
  }
}

function validateInjectedTarget(url: URL, allowPrivateHosts: string[]): void {
  const host = stripBrackets(url.hostname).toLowerCase();
  const allowlist = new Set(allowPrivateHosts.map((item) => stripBrackets(item.trim()).toLowerCase()).filter(Boolean));
  if (allowlist.has(host)) return;
  if (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
    (isIP(host) !== 0 && !isPublicAddress(host))
  ) {
    throw new Error('Target address is not public');
  }
}

function assertSecureCredentialTransport(url: URL, options: SafeRequestOptions): void {
  if (url.protocol !== 'http:' || !hasCredentials(url, options.headers ?? {})) return;
  const host = stripBrackets(url.hostname).toLowerCase();
  const allowlist = new Set((options.allowPrivateHosts ?? []).map((item) => stripBrackets(item.trim()).toLowerCase()).filter(Boolean));
  if (allowlist.has(host) || isLoopbackHost(host)) return;
  throw new Error('HTTPS is required when sending credentials to a public host');
}

function hasCredentials(url: URL, headers: Record<string, string>): boolean {
  if (Object.keys(headers).some(isSensitiveHeaderName)) return true;
  return [...url.searchParams.keys()].some((name) => (
    /^(?:key|api[-_]?key|access[-_]?token|auth[-_]?token|token|client[-_]?secret|secret)$/i.test(name)
  ));
}

function isSensitiveHeaderName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (['authorization', 'proxy-authorization', 'cookie'].includes(normalized)) return true;
  return /(?:^|[-_])(?:api[-_]?key|access[-_]?token|auth[-_]?token|session[-_]?token|security[-_]?token|client[-_]?secret|token|secret)$/.test(normalized);
}

function isLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const normalized = normalizeAddress(host);
  return normalized === '::1' || normalized.startsWith('127.');
}

function toResponse(result: SafeResponse): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(result.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, String(value));
  }
  return new Response(toArrayBuffer(result.body), { status: result.statusCode, headers });
}

function toArrayBuffer(body: Buffer): ArrayBuffer {
  const copy = new Uint8Array(new ArrayBuffer(body.length));
  copy.set(body);
  return copy.buffer;
}

function redirectOptions(options: SafeRequestOptions, previousUrl: URL, nextUrl: URL): SafeRequestOptions {
  const headers = { ...(options.headers ?? {}) };
  if (previousUrl.origin !== nextUrl.origin) {
    for (const name of Object.keys(headers)) {
      if (isSensitiveHeaderName(name)) {
        delete headers[name];
      }
    }
  }
  return { ...options, headers };
}

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function isRedirect(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}

function stripBrackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

function normalizeAddress(value: string): string {
  const address = stripBrackets(value.trim());
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}
