import type { LinkHealthStatus, LinkRecord } from './repository.js';
import { requestSafeResource } from '../utils/safe-fetch.js';

export interface LinkHealthResult {
  id: number;
  name: string;
  url: string;
  status: LinkHealthStatus;
  statusCode?: number;
  finalUrl?: string;
  reason?: string;
  checkedAt: string;
}

export interface LinkHealthSummary {
  total: number;
  ok: number;
  redirected: number;
  broken: number;
  timeout: number;
  invalid: number;
}

type SafeRequester = typeof requestSafeResource;
const HEAD_FALLBACK_STATUSES = new Set([403, 405, 501]);

export interface LinkHealthCheckOptions {
  allowPrivateHosts?: string[];
  concurrency?: number;
}

export async function checkLinksHealth(
  links: LinkRecord[],
  requester: SafeRequester = requestSafeResource,
  options: LinkHealthCheckOptions = {},
) {
  const results = await mapWithConcurrency(
    links,
    normalizeConcurrency(options.concurrency),
    (link) => checkOneLink(link, requester, options),
  );
  const summary = results.reduce<LinkHealthSummary>(
    (counts, result) => {
      counts[result.status] += 1;
      return counts;
    },
    { total: results.length, ok: 0, redirected: 0, broken: 0, timeout: 0, invalid: 0 },
  );
  return { summary, results };
}

export async function checkOneLink(
  link: LinkRecord,
  requester: SafeRequester = requestSafeResource,
  options: LinkHealthCheckOptions = {},
): Promise<LinkHealthResult> {
  const checkedAt = new Date().toISOString();
  const url = parseHttpUrl(link.url);
  if (!url) return baseResult(link, checkedAt, 'invalid', undefined, undefined, 'URL must start with http:// or https://');

  try {
    const response = await requestLink(requester, url, 'HEAD', options);
    const finalResponse = HEAD_FALLBACK_STATUSES.has(response.statusCode)
      ? await requestLink(requester, url, 'GET', options)
      : response;
    const finalUrl = finalResponse.finalUrl || url.href;
    const status = finalResponse.statusCode < 400
      ? (finalUrl !== url.href ? 'redirected' : 'ok')
      : 'broken';
    return baseResult(link, checkedAt, status, finalResponse.statusCode, status === 'redirected' ? finalUrl : undefined);
  } catch (event) {
    const message = event instanceof Error ? event.message : 'Request failed';
    return baseResult(link, checkedAt, /timed out|aborted/i.test(message) ? 'timeout' : 'broken', undefined, undefined, message);
  }
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function baseResult(
  link: LinkRecord,
  checkedAt: string,
  status: LinkHealthStatus,
  statusCode?: number,
  finalUrl?: string,
  reason?: string,
): LinkHealthResult {
  return {
    id: link.id,
    name: link.name,
    url: link.url,
    status,
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(finalUrl ? { finalUrl } : {}),
    ...(reason ? { reason } : {}),
    checkedAt,
  };
}

function requestLink(requester: SafeRequester, url: URL, method: 'HEAD' | 'GET', options: LinkHealthCheckOptions) {
  return requester(url.href, {
    method,
    headers: {
      accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'user-agent': 'Nono-Link-Health/0.2 (+https://github.com/noaul/nono)',
    },
    timeoutMs: 5000,
    maxRedirects: 5,
    discardBody: true,
    allowPrivateHosts: options.allowPrivateHosts,
  });
}

function normalizeConcurrency(value: number | undefined) {
  return Math.min(8, Math.max(1, Math.floor(value || 4)));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, action: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await action(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
