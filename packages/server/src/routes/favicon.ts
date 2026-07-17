import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../types.js';

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

// Disk layer survives restarts; NONO_FAVICON_CACHE_DIR overrides (empty string disables).
function getDiskDir() {
  return process.env.NONO_FAVICON_CACHE_DIR ?? path.resolve(process.cwd(), '.favicon-cache');
}

function diskPaths(domain: string) {
  const dir = getDiskDir();
  return {
    icon: path.join(dir, `${domain}.icon`),
    meta: path.join(dir, `${domain}.json`),
  };
}

function readDisk(domain: string): CacheEntry | undefined {
  if (!getDiskDir()) return undefined;
  try {
    const { icon, meta } = diskPaths(domain);
    const parsed = JSON.parse(fs.readFileSync(meta, 'utf8')) as { contentType: string; expires: number; miss?: boolean };
    if (!parsed.expires || parsed.expires < Date.now()) return undefined;
    if (parsed.miss) return { body: null, contentType: '', expires: parsed.expires };
    return { body: fs.readFileSync(icon), contentType: parsed.contentType, expires: parsed.expires };
  } catch {
    return undefined;
  }
}

function writeDisk(domain: string, entry: CacheEntry) {
  const dir = getDiskDir();
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const { icon, meta } = diskPaths(domain);
    if (entry.body) {
      fs.writeFileSync(icon, entry.body);
      fs.writeFileSync(meta, JSON.stringify({ contentType: entry.contentType, expires: entry.expires }));
    } else {
      fs.writeFileSync(meta, JSON.stringify({ contentType: '', expires: entry.expires, miss: true }));
    }
  } catch {
    // Disk cache is best-effort; memory layer still works.
  }
}

function readCache(domain: string) {
  const entry = cache.get(domain);
  if (entry) {
    if (entry.expires >= Date.now()) return entry;
    cache.delete(domain);
  }
  const disk = readDisk(domain);
  if (disk) {
    writeMemory(domain, disk);
    return disk;
  }
  return undefined;
}

function writeMemory(domain: string, entry: CacheEntry) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(domain, entry);
}

function writeCache(domain: string, entry: CacheEntry) {
  writeMemory(domain, entry);
  writeDisk(domain, entry);
}

async function fetchIcon(services: AppServices, url: string): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const response = await services.publicFetcher!(url, { maxBytes: MAX_ICON_BYTES, timeoutMs: FETCH_TIMEOUT_MS });
    if (response.statusCode < 200 || response.statusCode >= 300) return null;
    const contentType = headerValue(response.headers['content-type']);
    if (!contentType.startsWith('image/')) return null;
    const declaredLength = Number(headerValue(response.headers['content-length']) || 0);
    if (declaredLength > MAX_ICON_BYTES) return null;
    const body = response.body;
    if (!body.length || body.length > MAX_ICON_BYTES) return null;
    return { body, contentType };
  } catch (error) {
    if (error instanceof Error && error.message === 'Target address is not public') throw error;
    return null;
  }
}

export async function faviconRoutes(app: FastifyInstance, services: AppServices) {
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

    try {
      await services.publicAddressResolver!(domain);
    } catch {
      return reply.status(400).send({ code: 400, data: null, message: 'Invalid domain' });
    }

    const sources = [
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`,
      `https://${domain}/favicon.ico`,
    ];

    for (const source of sources) {
      let icon: Awaited<ReturnType<typeof fetchIcon>>;
      try {
        icon = await fetchIcon(services, source);
      } catch {
        return reply.status(400).send({ code: 400, data: null, message: 'Invalid domain' });
      }
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

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}
