import type { FastifyInstance } from 'fastify';

const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const MAX_ICON_BYTES = 200 * 1024;
const FETCH_TIMEOUT_MS = 4000;
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;

type CacheEntry = {
  body: Buffer | null;
  contentType: string;
  expires: number;
};

const cache = new Map<string, CacheEntry>();

function readCache(domain: string) {
  const entry = cache.get(domain);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    cache.delete(domain);
    return undefined;
  }
  return entry;
}

function writeCache(domain: string, entry: CacheEntry) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(domain, entry);
}

async function fetchIcon(url: string): Promise<{ body: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_ICON_BYTES) return null;
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > MAX_ICON_BYTES) return null;
    return { body, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function faviconRoutes(app: FastifyInstance) {
  app.get('/api/favicon', async (request, reply) => {
    const domain = String((request.query as any).domain || '')
      .trim()
      .toLowerCase();
    if (!HOSTNAME_PATTERN.test(domain)) {
      return reply.status(400).send({ code: 400, data: null, message: 'Invalid domain' });
    }

    const cached = readCache(domain);
    if (cached) {
      if (!cached.body) return reply.status(404).send({ code: 404, data: null, message: 'Favicon not found' });
      return reply
        .header('cache-control', 'public, max-age=604800, immutable')
        .type(cached.contentType)
        .send(cached.body);
    }

    const sources = [
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`,
      `https://${domain}/favicon.ico`,
    ];

    for (const source of sources) {
      const icon = await fetchIcon(source);
      if (icon) {
        writeCache(domain, { body: icon.body, contentType: icon.contentType, expires: Date.now() + HIT_TTL_MS });
        return reply
          .header('cache-control', 'public, max-age=604800, immutable')
          .type(icon.contentType)
          .send(icon.body);
      }
    }

    writeCache(domain, { body: null, contentType: '', expires: Date.now() + MISS_TTL_MS });
    return reply.status(404).send({ code: 404, data: null, message: 'Favicon not found' });
  });
}
