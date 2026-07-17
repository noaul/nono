import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512 * 1024;

function isFetchableUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    // Block obvious SSRF targets: loopback, link-local, private ranges, bare IPs without dots handled by URL.
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const [a, b] = host.split('.').map(Number);
      if (a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return false;
    }
    if (host.includes(':')) return false; // IPv6 literals
    return true;
  } catch {
    return false;
  }
}

function decodeEntities(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function extractPageMeta(html: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '';
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ||
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1] ||
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ||
    '';
  return {
    title: decodeEntities(title).slice(0, 120),
    description: decodeEntities(description).slice(0, 200),
  };
}

export async function metaRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/fetch-meta', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;

    const url = String((request.query as any).url || '').trim();
    if (!isFetchableUrl(url)) {
      return reply.status(400).send({ code: 400, data: null, message: '无法抓取该地址' });
    }

    try {
      const response = await services.publicFetcher!(url, {
        timeoutMs: FETCH_TIMEOUT_MS,
        maxBytes: MAX_HTML_BYTES,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; NonoBot/1.0)', accept: 'text/html' },
      });
      const contentType = headerValue(response.headers['content-type']);
      if (response.statusCode < 200 || response.statusCode >= 300 || !contentType.includes('text/html')) {
        return sendOk(reply, { title: '', description: '' });
      }
      const html = response.body.toString('utf8');
      return sendOk(reply, extractPageMeta(html));
    } catch (error) {
      if (error instanceof Error && error.message === 'Target address is not public') {
        return reply.status(400).send({ code: 400, data: null, message: '无法抓取该地址' });
      }
      return sendOk(reply, { title: '', description: '' });
    }
  });
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}
