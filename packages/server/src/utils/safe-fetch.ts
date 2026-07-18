import dns from 'node:dns/promises';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

export interface PublicFetchResult {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  finalUrl?: string;
}

export interface PublicFetchOptions {
  discardBody?: boolean;
  headers?: Record<string, string>;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

export interface SafeRequestOptions extends PublicFetchOptions {
  method?: string;
  body?: string | Buffer;
  allowPrivateHosts?: string[];
  signal?: AbortSignal;
}

type LookupAddress = { address: string; family: 4 | 6 };
type Lookup = (hostname: string) => Promise<LookupAddress[]>;
type Request = (url: URL, address: LookupAddress, options: SafeRequestOptions) => Promise<PublicFetchResult>;

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedV4.addSubnet(network, prefix, 'ipv4');
}

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
blockedV6.addSubnet('2001:2::', 48, 'ipv6');
blockedV6.addSubnet('2001:db8::', 32, 'ipv6');

export function isPublicAddress(rawAddress: string) {
  const address = normalizeAddress(rawAddress);
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  if (family === 6) return globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
  return false;
}

export async function resolvePublicAddress(hostname: string, lookup: Lookup = defaultLookup): Promise<LookupAddress> {
  const host = stripIpv6Brackets(hostname).toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Target address is not public');
  }

  const literalFamily = isIP(host);
  const addresses = literalFamily ? [{ address: host, family: literalFamily as 4 | 6 }] : await lookup(host);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Target address is not public');
  }
  return addresses[0];
}

export async function fetchPublicResource(
  rawUrl: string,
  options: PublicFetchOptions = {},
  dependencies: { lookup?: Lookup; request?: Request } = {},
): Promise<PublicFetchResult> {
  return requestSafeResource(rawUrl, { ...options, method: 'GET' }, dependencies);
}

export async function requestSafeResource(
  rawUrl: string,
  options: SafeRequestOptions = {},
  dependencies: { lookup?: Lookup; request?: Request } = {},
): Promise<PublicFetchResult> {
  const lookup = dependencies.lookup || defaultLookup;
  const request = dependencies.request || requestOnce;
  let url = parsePublicUrl(rawUrl);
  const maxRedirects = options.maxRedirects ?? 3;
  let requestOptions: SafeRequestOptions = {
    ...options,
    method: (options.method || 'GET').toUpperCase(),
    headers: { ...(options.headers || {}) },
  };

  for (let redirectCount = 0; ; redirectCount += 1) {
    const address = await resolveRequestAddress(url.hostname, requestOptions.allowPrivateHosts || [], lookup);
    const response = await request(url, address, requestOptions);
    const location = firstHeader(response.headers.location);
    if (!isRedirect(response.statusCode) || !location) return { ...response, finalUrl: url.href };
    if (redirectCount >= maxRedirects) throw new Error('Too many redirects');
    const nextUrl = parsePublicUrl(new URL(location, url).href);
    requestOptions = redirectedOptions(requestOptions, response.statusCode, url, nextUrl);
    url = nextUrl;
  }
}

async function resolveRequestAddress(hostname: string, allowPrivateHosts: string[], lookup: Lookup) {
  const host = stripIpv6Brackets(hostname).toLowerCase();
  const allowlist = new Set(allowPrivateHosts.map((item) => stripIpv6Brackets(item.trim()).toLowerCase()).filter(Boolean));
  if (!allowlist.has(host)) return resolvePublicAddress(host, lookup);

  const literalFamily = isIP(host);
  const addresses = literalFamily ? [{ address: host, family: literalFamily as 4 | 6 }] : await lookup(host);
  if (!addresses.length) throw new Error('Target address could not be resolved');
  return addresses[0];
}

function parsePublicUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only public HTTP and HTTPS URLs are allowed');
  }
  return url;
}

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

function requestOnce(url: URL, address: LookupAddress, options: SafeRequestOptions): Promise<PublicFetchResult> {
  const transport = url.protocol === 'https:' ? https : http;
  const maxBytes = options.maxBytes ?? 512 * 1024;
  const timeoutMs = options.timeoutMs ?? 5000;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        hostname: address.address,
        family: address.family,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: options.method || 'GET',
        servername: url.protocol === 'https:' && !isIP(stripIpv6Brackets(url.hostname)) ? url.hostname : undefined,
        headers: { ...options.headers, host: url.host },
      },
      (response) => {
        if (options.discardBody) {
          response.on('error', () => {});
          resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: Buffer.alloc(0) });
          response.destroy();
          return;
        }
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
        response.on('end', () => resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks) }));
        response.on('error', reject);
      },
    );
    if (options.signal) {
      if (options.signal.aborted) request.destroy(new Error('Request aborted'));
      else options.signal.addEventListener('abort', () => request.destroy(new Error('Request aborted')), { once: true });
    }
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Request timed out')));
    request.on('error', reject);
    request.end(options.body);
  });
}

function redirectedOptions(options: SafeRequestOptions, statusCode: number, previousUrl: URL, nextUrl: URL): SafeRequestOptions {
  const headers = { ...(options.headers || {}) };
  if (previousUrl.origin !== nextUrl.origin) {
    for (const name of Object.keys(headers)) {
      if (['authorization', 'proxy-authorization', 'cookie', 'x-api-key', 'api-key'].includes(name.toLowerCase())) delete headers[name];
    }
  }

  const method = (options.method || 'GET').toUpperCase();
  if (statusCode === 303 || ((statusCode === 301 || statusCode === 302) && method === 'POST')) {
    for (const name of Object.keys(headers)) {
      if (['content-length', 'content-type'].includes(name.toLowerCase())) delete headers[name];
    }
    return { ...options, method: 'GET', body: undefined, headers };
  }
  return { ...options, headers };
}

function isRedirect(statusCode: number) {
  return statusCode >= 300 && statusCode < 400;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function stripIpv6Brackets(value: string) {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

function normalizeAddress(value: string) {
  const address = stripIpv6Brackets(value.trim());
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}
