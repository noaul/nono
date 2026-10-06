import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppServices } from '../types.js';

const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const MAX_ICON_BYTES = 200 * 1024;
const FETCH_TIMEOUT_MS = 4000;
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
// Each disk entry is at most two small files; past this many domains the oldest tenth is pruned.
const MAX_DISK_ENTRIES = 5000;
// Cache hits are free, so only lookups that go upstream (up to three fetches each) are budgeted.
const UPSTREAM_LOOKUPS_PER_MINUTE = 60;
const MAX_TRACKED_CLIENTS = 10_000;

type CacheEntry = {
  body: Buffer | null;
  contentType: string;
  expires: number;
};

const cache = new Map<string, CacheEntry>();
const upstreamBudget = new Map<string, { count: number; resetAt: number }>();
let diskEntries: number | null = null;
let pruning: Promise<void> | null = null;

function takeUpstreamLookup(client: string, now = Date.now()) {
  let bucket = upstreamBudget.get(client);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && upstreamBudget.size >= MAX_TRACKED_CLIENTS) {
      for (const [key, value] of upstreamBudget) if (value.resetAt <= now) upstreamBudget.delete(key);
      if (upstreamBudget.size >= MAX_TRACKED_CLIENTS) return false;
    }
    bucket = { count: 0, resetAt: now + 60_000 };
    upstreamBudget.set(client, bucket);
  }
  bucket.count += 1;
  return bucket.count <= UPSTREAM_LOOKUPS_PER_MINUTE;
}

/** Test hook: forget rate-limit buckets and the disk entry count. */
export function resetFaviconState() {
  cache.clear();
  upstreamBudget.clear();
  diskEntries = null;
}

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

async function readDisk(domain: string): Promise<CacheEntry | undefined> {
  if (!getDiskDir()) return undefined;
  try {
    const { icon, meta } = diskPaths(domain);
    const parsed = JSON.parse(await fs.readFile(meta, 'utf8')) as { contentType: string; expires: number; miss?: boolean };
    if (!parsed.expires || parsed.expires < Date.now()) return undefined;
    if (parsed.miss) return { body: null, contentType: '', expires: parsed.expires };
    if (!isServableType(parsed.contentType)) return undefined;
    return { body: await fs.readFile(icon), contentType: parsed.contentType, expires: parsed.expires };
  } catch {
    return undefined;
  }
}

async function countDiskEntries(dir: string) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

// Drops the least recently written tenth of the cache, by the mtime of each domain's meta file.
async function pruneDisk(dir: string) {
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
  const stats = await Promise.all(names.map(async (name) => {
    try {
      return { name, mtime: (await fs.stat(path.join(dir, name))).mtimeMs };
    } catch {
      return null;
    }
  }));
  const entries = stats.filter((item): item is { name: string; mtime: number } => Boolean(item)).sort((a, b) => a.mtime - b.mtime);
  const drop = entries.slice(0, Math.max(1, entries.length - Math.floor(MAX_DISK_ENTRIES * 0.9)));
  await Promise.all(drop.flatMap(({ name }) => {
    const domain = name.slice(0, -'.json'.length);
    return [fs.rm(path.join(dir, name), { force: true }), fs.rm(path.join(dir, `${domain}.icon`), { force: true })];
  }));
  diskEntries = entries.length - drop.length;
}

async function writeDisk(domain: string, entry: CacheEntry) {
  const dir = getDiskDir();
  if (!dir) return;
  try {
    await fs.mkdir(dir, { recursive: true });
    diskEntries ??= await countDiskEntries(dir);
    const { icon, meta } = diskPaths(domain);
    const isNew = await fs.access(meta).then(() => false, () => true);
    if (entry.body) {
      await fs.writeFile(icon, entry.body);
      await fs.writeFile(meta, JSON.stringify({ contentType: entry.contentType, expires: entry.expires }));
    } else {
      await fs.writeFile(meta, JSON.stringify({ contentType: '', expires: entry.expires, miss: true }));
    }
    if (isNew) diskEntries += 1;
    if (diskEntries > MAX_DISK_ENTRIES && !pruning) {
      pruning = pruneDisk(dir).catch(() => undefined).finally(() => { pruning = null; });
      await pruning;
    }
  } catch {
    // Disk cache is best-effort; memory layer still works.
  }
}

async function readCache(domain: string) {
  const entry = cache.get(domain);
  if (entry) {
    if (entry.expires >= Date.now()) return entry;
    cache.delete(domain);
  }
  const disk = await readDisk(domain);
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

async function writeCache(domain: string, entry: CacheEntry) {
  writeMemory(domain, entry);
  await writeDisk(domain, entry);
}

// SVG can carry script, and the icon is served from this origin, so only raster formats pass.
function isServableType(contentType: string) {
  const type = contentType.split(';')[0].trim().toLowerCase();
  return type.startsWith('image/') && !type.includes('svg');
}

function sendIcon(reply: FastifyReply, entry: { body: Buffer; contentType: string }) {
  return reply
    .header('cache-control', 'public, max-age=604800, immutable')
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', "default-src 'none'; sandbox")
    .type(entry.contentType)
    .send(entry.body);
}

async function fetchIcon(services: AppServices, url: string): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const response = await services.publicFetcher!(url, { maxBytes: MAX_ICON_BYTES, timeoutMs: FETCH_TIMEOUT_MS });
    if (response.statusCode < 200 || response.statusCode >= 300) return null;
    const contentType = headerValue(response.headers['content-type']);
    if (!isServableType(contentType)) return null;
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
    const cached = await readCache(domain);
    if (cached) {
      if (!cached.body) return reply.status(404).send({ code: 404, data: null, message: 'Favicon not found' });
      return sendIcon(reply, { body: cached.body, contentType: cached.contentType });
    }
    if (!takeUpstreamLookup(request.ip)) {
      return reply.status(429).header('retry-after', '60').send({ code: 429, data: null, message: 'Too many favicon lookups' });
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
        await writeCache(domain, { body: icon.body, contentType: icon.contentType, expires: Date.now() + HIT_TTL_MS });
        return sendIcon(reply, icon);
      }
    }

    await writeCache(domain, { body: null, contentType: '', expires: Date.now() + MISS_TTL_MS });
    return reply.status(404).send({ code: 404, data: null, message: 'Favicon not found' });
  });
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}
