import type { LinkRecord } from './repository.js';

export type LinkHealthStatus = 'ok' | 'broken' | 'timeout' | 'invalid';

export interface LinkHealthResult {
  id: number;
  name: string;
  url: string;
  status: LinkHealthStatus;
  statusCode?: number;
  reason?: string;
  checkedAt: string;
}

export interface LinkHealthSummary {
  total: number;
  ok: number;
  broken: number;
  timeout: number;
  invalid: number;
}

type FetchLike = typeof fetch;

export async function checkLinksHealth(links: LinkRecord[], fetchImpl: FetchLike = fetch) {
  const results = await Promise.all(links.map((link) => checkOneLink(link, fetchImpl)));
  const summary = results.reduce<LinkHealthSummary>(
    (counts, result) => {
      counts[result.status] += 1;
      return counts;
    },
    { total: results.length, ok: 0, broken: 0, timeout: 0, invalid: 0 },
  );
  return { summary, results };
}

export async function checkOneLink(link: LinkRecord, fetchImpl: FetchLike = fetch): Promise<LinkHealthResult> {
  const checkedAt = new Date().toISOString();
  const url = parseHttpUrl(link.url);
  if (!url) return baseResult(link, checkedAt, 'invalid', undefined, 'URL must start with http:// or https://');

  try {
    const response = await fetchWithTimeout(fetchImpl, url, 'HEAD');
    const finalResponse = response.status === 405 ? await fetchWithTimeout(fetchImpl, url, 'GET') : response;
    return baseResult(link, checkedAt, finalResponse.status < 400 ? 'ok' : 'broken', finalResponse.status);
  } catch (event) {
    const message = event instanceof Error ? event.message : 'Request failed';
    return baseResult(link, checkedAt, message === 'Link health check timed out' ? 'timeout' : 'broken', undefined, message);
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

function baseResult(link: LinkRecord, checkedAt: string, status: LinkHealthStatus, statusCode?: number, reason?: string): LinkHealthResult {
  return { id: link.id, name: link.name, url: link.url, status, ...(statusCode ? { statusCode } : {}), ...(reason ? { reason } : {}), checkedAt };
}

async function fetchWithTimeout(fetchImpl: FetchLike, url: URL, method: 'HEAD' | 'GET') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Link health check timed out')), 5000);
  try {
    return await fetchImpl(url, { method, redirect: 'follow', signal: controller.signal });
  } catch (event) {
    if (controller.signal.aborted) throw new Error('Link health check timed out');
    throw event;
  } finally {
    clearTimeout(timeout);
  }
}
