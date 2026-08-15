import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { CLIP_INGEST_BODY_LIMIT } from '../src/services/clip-content.js';

const sessionSecret = 'clipper-route-test-session-secret';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const adminPassword = 'Password2026!';

type ClipRow = Record<string, any>;

/**
 * A stand-in for the Clipper tables. It records the `where` clause of every read so the tests can
 * assert that no query ever escapes its tenant, which is the property that matters most here.
 */
function createClipStore() {
  const rows: ClipRow[] = [];
  const tags: ClipRow[] = [];
  const seenWhere: Array<Record<string, unknown>> = [];
  const rawQueries: Array<{ strings: string[]; values: unknown[] }> = [];
  let nextId = 1;
  let nextTagId = 1;

  const matches = (row: ClipRow, where: any = {}) => {
    if (where.id != null && row.id !== where.id) return false;
    if (where.userId != null && row.userId !== where.userId) return false;
    if (where.status != null && row.status !== where.status) return false;
    return true;
  };

  const clip = {
    findFirst: async ({ where }: any) => {
      seenWhere.push(where);
      return rows.find((row) => matches(row, where)) || null;
    },
    findUnique: async ({ where }: any) => {
      seenWhere.push(where);
      const key = where.userId_canonicalUrl;
      if (!key) return rows.find((row) => row.id === where.id) || null;
      return rows.find((row) => row.userId === key.userId && row.canonicalUrl === key.canonicalUrl) || null;
    },
    findMany: async ({ where, select }: any) => {
      seenWhere.push(where);
      const found = rows.filter((row) => matches(row, where));
      // Honour `select` so the test proves the route withholds article bodies rather than proving
      // the stub does.
      if (!select) return found;
      return found.map((row) => Object.fromEntries(
        Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]]),
      ));
    },
    count: async ({ where }: any) => rows.filter((row) => matches(row, where)).length,
    create: async ({ data }: any) => {
      const row = { id: nextId++, contentVersion: 1, ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = rows.find((item) => item.id === where.id);
      Object.assign(row, data);
      return row;
    },
    deleteMany: async ({ where }: any) => {
      seenWhere.push(where);
      const kept = rows.filter((row) => !matches(row, where));
      const removed = rows.length - kept.length;
      rows.length = 0;
      rows.push(...kept);
      return { count: removed };
    },
  };

  const tx = {
    clip,
    clipTag: {
      findMany: async ({ where }: any) => {
        seenWhere.push(where);
        return tags.filter((tag) => tag.userId === where.userId
          || (where.id?.in && where.id.in.includes(tag.id) && tag.userId === where.userId));
      },
      findFirst: async ({ where }: any) => {
        seenWhere.push(where);
        return tags.find((tag) => tag.userId === where.userId
          && (where.normalizedName ? tag.normalizedName === where.normalizedName : tag.id === where.id)) || null;
      },
      create: async ({ data }: any) => {
        const tag = { id: nextTagId++, ...data };
        tags.push(tag);
        return tag;
      },
      updateMany: async ({ where, data }: any) => {
        seenWhere.push(where);
        const target = tags.find((tag) => tag.id === where.id && tag.userId === where.userId);
        if (!target) return { count: 0 };
        Object.assign(target, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }: any) => {
        seenWhere.push(where);
        const before = tags.length;
        const kept = tags.filter((tag) => !(tag.id === where.id && tag.userId === where.userId));
        tags.length = 0;
        tags.push(...kept);
        return { count: before - tags.length };
      },
      upsert: async ({ create }: any) => ({ id: 1, ...create }),
    },
    clipTagOnClip: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 0 }) },
    clipHighlight: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 1, ...data }),
      deleteMany: async () => ({ count: 0 }),
    },
    link: { findFirst: async () => null },
    trashItem: { create: async ({ data }: any) => ({ id: 'trash-1', ...data }) },
  };

  return {
    rows,
    tags,
    seenWhere,
    rawQueries,
    prisma: {
      ...tx,
      $transaction: async (operation: any) => operation(tx),
      $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
        rawQueries.push({ strings: [...strings], values });
        return Promise.resolve(rows.map((row) => ({ id: row.id, title: row.title, excerpt: row.excerpt })));
      },
    },
  };
}

describe('Clipper routes', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;
  let store: ReturnType<typeof createClipStore>;

  const clipPayload = {
    url: 'https://example.com/article?utm_source=news',
    title: 'Article',
    contentHtml: '<p>body</p>',
    contentMd: 'body',
    extractor: 'defuddle',
  };

  async function setupAdmin() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password: adminPassword },
    });
    const cookie = response.headers['set-cookie'];
    return Array.isArray(cookie) ? cookie[0] : String(cookie);
  }

  async function createToken(cookie: string, scopes: string[]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie },
      payload: { name: `token-${scopes.join('-')}`, scopes },
    });
    return response.json().data.token as string;
  }

  beforeEach(async () => {
    repo = new MemoryRepository(false);
    store = createClipStore();
    app = await buildApp({ repo, sessionSecret, encryptionKey, prisma: store.prisma as never });
  });

  afterEach(async () => {
    await app.close();
  });

  it('stores a clip for the authenticated browser session', async () => {
    const cookie = await setupAdmin();

    const response = await app.inject({
      method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(store.rows).toHaveLength(1);
    // Tracking parameters are stripped before the row is written.
    expect(store.rows[0].canonicalUrl).toBe('https://example.com/article');
    expect(store.rows[0].userId).toBe(1);
  });

  it('deduplicates on the canonical URL instead of creating a second row', async () => {
    const cookie = await setupAdmin();

    await app.inject({ method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload });
    await app.inject({
      method: 'POST',
      url: '/api/clipper/clips',
      headers: { cookie },
      payload: { ...clipPayload, url: 'https://example.com/article?utm_campaign=other', title: 'Updated' },
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].title).toBe('Updated');
  });

  it('sanitizes clipped HTML before storing it', async () => {
    const cookie = await setupAdmin();

    await app.inject({
      method: 'POST',
      url: '/api/clipper/clips',
      headers: { cookie },
      payload: { ...clipPayload, contentHtml: '<p>ok</p><script>steal()</script><img src=x onerror=steal()>' },
    });

    expect(store.rows[0].contentHtml).not.toContain('<script');
    expect(store.rows[0].contentHtml).not.toContain('onerror');
  });

  it('omits article bodies from the list response', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload });

    const listed = await app.inject({ method: 'GET', url: '/api/clipper/clips', headers: { cookie } });

    expect(listed.statusCode).toBe(200);
    const [first] = listed.json().data.items;
    expect(first.contentHtml).toBeUndefined();
    expect(first.contentMd).toBeUndefined();
  });

  it('scopes every read to the authenticated user', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload });
    await app.inject({ method: 'GET', url: '/api/clipper/clips', headers: { cookie } });
    await app.inject({ method: 'GET', url: '/api/clipper/clips/1', headers: { cookie } });

    expect(store.seenWhere.length).toBeGreaterThan(0);
    for (const where of store.seenWhere) {
      const scoped = 'userId' in where || 'userId_canonicalUrl' in where;
      expect(scoped, `unscoped query: ${JSON.stringify(where)}`).toBe(true);
    }
  });

  it('returns 404 rather than 403 for a clip owned by someone else', async () => {
    const cookie = await setupAdmin();
    store.rows.push({ id: 99, userId: 4242, title: 'Someone else', canonicalUrl: 'https://other.test/a' });

    const response = await app.inject({ method: 'GET', url: '/api/clipper/clips/99', headers: { cookie } });

    expect(response.statusCode).toBe(404);
  });

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/clipper/clips' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects invalid payloads', async () => {
    const cookie = await setupAdmin();

    const response = await app.inject({
      method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: { url: 'not-a-url', title: '' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(store.rows).toHaveLength(0);
  });

  it('rejects a non-http scheme', async () => {
    const cookie = await setupAdmin();

    const response = await app.inject({
      method: 'POST',
      url: '/api/clipper/clips',
      headers: { cookie },
      payload: { ...clipPayload, url: 'ftp://example.com/a' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(store.rows).toHaveLength(0);
  });

  it('accepts a bearer token carrying clip scopes', async () => {
    const cookie = await setupAdmin();
    const token = await createToken(cookie, ['clips:read', 'clips:write']);

    const written = await app.inject({
      method: 'POST',
      url: '/api/clipper/clips',
      headers: { authorization: `Bearer ${token}` },
      payload: clipPayload,
    });
    const read = await app.inject({
      method: 'GET',
      url: '/api/clipper/clips',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(written.statusCode).toBe(200);
    expect(read.statusCode).toBe(200);
  });

  it('refuses a bookmark-only token', async () => {
    const cookie = await setupAdmin();
    const token = await createToken(cookie, ['bookmarks:read', 'bookmarks:write']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/clipper/clips',
      headers: { authorization: `Bearer ${token}` },
      payload: clipPayload,
    });

    expect(response.statusCode).toBe(403);
    expect(store.rows).toHaveLength(0);
  });

  it('refuses a read-only token on a write', async () => {
    const cookie = await setupAdmin();
    const token = await createToken(cookie, ['clips:read']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/clipper/clips',
      headers: { authorization: `Bearer ${token}` },
      payload: clipPayload,
    });

    expect(response.statusCode).toBe(403);
  });

  it('accepts an ingest body larger than the default Fastify limit', async () => {
    const cookie = await setupAdmin();
    // Fastify defaults to 1 MiB; clips are allowed 6 MiB.
    const big = 'a'.repeat(1024 * 1024 + 4096);

    const response = await app.inject({
      method: 'POST',
      url: '/api/clipper/clips',
      headers: { cookie },
      payload: { ...clipPayload, contentMd: big, contentHtml: `<p>${big}</p>` },
    });

    expect(response.statusCode).toBe(200);
    expect(CLIP_INGEST_BODY_LIMIT).toBe(6 * 1024 * 1024);
  });

  it('rejects content past the per-field limit', async () => {
    const cookie = await setupAdmin();
    const tooBig = 'a'.repeat(2 * 1024 * 1024 + 1);

    const response = await app.inject({
      method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: { ...clipPayload, contentMd: tooBig },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(store.rows).toHaveLength(0);
  });

  it('updates and deletes only the caller\'s own clip', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload });

    const patched = await app.inject({
      method: 'PATCH', url: '/api/clipper/clips/1', headers: { cookie }, payload: { status: 'archived' },
    });
    expect(patched.statusCode).toBe(200);
    expect(store.rows[0].status).toBe('archived');

    const deleted = await app.inject({ method: 'DELETE', url: '/api/clipper/clips/1', headers: { cookie } });
    expect(deleted.statusCode).toBe(200);
    expect(store.rows).toHaveLength(0);
  });

  it('rejects an unknown status value', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload });

    const response = await app.inject({
      method: 'PATCH', url: '/api/clipper/clips/1', headers: { cookie }, payload: { status: 'deleted-forever' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('searches only within clips owned by the caller', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload });

    const response = await app.inject({
      method: 'GET', url: '/api/clipper/search?q=%E5%89%AA%E8%97%8F', headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(store.rawQueries).toHaveLength(1);
    // The tenant predicate is part of the statement, not something the caller can influence.
    expect(store.rawQueries[0].values).toContain(1);
    expect(store.rawQueries[0].values).toContain('%剪藏%');
  });

  it('requires a read scope for search', async () => {
    const cookie = await setupAdmin();
    const token = await createToken(cookie, ['bookmarks:read']);

    const response = await app.inject({
      method: 'GET', url: '/api/clipper/search?q=a', headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('creates a tag and reuses it for a differently-cased duplicate', async () => {
    const cookie = await setupAdmin();

    const first = await app.inject({
      method: 'POST', url: '/api/clipper/tags', headers: { cookie }, payload: { name: 'Reading' },
    });
    const second = await app.inject({
      method: 'POST', url: '/api/clipper/tags', headers: { cookie }, payload: { name: 'reading' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.json().data.id).toBe(first.json().data.id);
    expect(store.tags).toHaveLength(1);
    // The display name stays as its owner first wrote it.
    expect(store.tags[0].name).toBe('Reading');
  });

  it('rejects an invalid tag colour', async () => {
    const cookie = await setupAdmin();

    const response = await app.inject({
      method: 'POST', url: '/api/clipper/tags', headers: { cookie }, payload: { name: 'X', color: 'red' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('does not delete a tag owned by someone else', async () => {
    const cookie = await setupAdmin();
    store.tags.push({ id: 77, userId: 4242, name: 'Theirs', normalizedName: 'theirs' });

    const response = await app.inject({ method: 'DELETE', url: '/api/clipper/tags/77', headers: { cookie } });

    expect(response.statusCode).toBe(404);
    expect(store.tags).toHaveLength(1);
  });

  it('stores a highlight with its surrounding context', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload });

    const response = await app.inject({
      method: 'POST',
      url: '/api/clipper/clips/1/highlights',
      headers: { cookie },
      payload: {
        text: 'body',
        anchor: { quote: 'body', prefix: 'the ', suffix: ' here', startOffset: 4, endOffset: 8 },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.anchor).toMatchObject({ quote: 'body', prefix: 'the ', suffix: ' here' });
    expect(response.json().data.contentVersion).toBe(1);
  });

  it('rejects a highlight anchor without a quote', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'POST', url: '/api/clipper/clips', headers: { cookie }, payload: clipPayload });

    const response = await app.inject({
      method: 'POST',
      url: '/api/clipper/clips/1/highlights',
      headers: { cookie },
      payload: { text: 'body', anchor: { startOffset: 4, endOffset: 8 } },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
