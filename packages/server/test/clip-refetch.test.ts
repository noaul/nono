import { describe, expect, it, vi } from 'vitest';
import { createClipRefetch } from '../src/services/clip-refetch.js';
import { ClipValidationError } from '../src/services/clip-content.js';
import { requestSafeResource } from '../src/utils/safe-fetch.js';

const ARTICLE = `<!doctype html><html><head><title>Fresh title</title></head><body>
  <article><p>Fresh body paragraph that is long enough to be treated as the main content here.</p></article>
</body></html>`;

const OWNER = { id: 7, role: 'user' };
const ADMIN = { id: 1, role: 'admin' };

function stubPrisma(clip: Record<string, unknown> | null = {}) {
  const row = clip && {
    id: 1,
    userId: 7,
    url: 'https://example.com/a',
    title: 'Old title',
    contentHash: 'old-hash',
    contentVersion: 1,
    contentHtml: '<p>old</p>',
    contentMd: 'old',
    wordCount: 1,
    author: null,
    siteName: null,
    ...clip,
  };
  const prisma = {
    clip: {
      findFirst: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...row, ...data })),
    },
  };
  return prisma;
}

function htmlResponse(body = ARTICLE, overrides: Record<string, unknown> = {}) {
  return {
    statusCode: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: Buffer.from(body),
    finalUrl: 'https://example.com/a',
    ...overrides,
  };
}

describe('clip refetch transport', () => {
  it('goes through the safe requester rather than opening its own fetch', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse());
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await refetch(OWNER, 1);

    expect(safeRequester).toHaveBeenCalledTimes(1);
    expect(safeRequester.mock.calls[0][0]).toBe('https://example.com/a');
  });

  it('applies the size, redirect and timeout budget', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse());
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await refetch(OWNER, 1);

    expect(safeRequester.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      maxBytes: 4 * 1024 * 1024,
      maxRedirects: 3,
      timeoutMs: 10_000,
    });
  });

  it('withholds the private host allowlist from non-administrators', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse());
    const refetch = createClipRefetch({
      prisma: prisma as never,
      safeRequester: safeRequester as never,
      privateOutboundHosts: ['internal.lan'],
    });

    await refetch(OWNER, 1);

    expect(safeRequester.mock.calls[0][1].allowPrivateHosts).toEqual([]);
  });

  it('grants the private host allowlist to administrators', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse());
    const refetch = createClipRefetch({
      prisma: prisma as never,
      safeRequester: safeRequester as never,
      privateOutboundHosts: ['internal.lan'],
    });

    await refetch(ADMIN, 1, true);

    expect(safeRequester.mock.calls[0][1].allowPrivateHosts).toEqual(['internal.lan']);
  });

  it('withholds the private host allowlist from administrators unless the caller authorizes it', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse());
    const refetch = createClipRefetch({
      prisma: prisma as never,
      safeRequester: safeRequester as never,
      privateOutboundHosts: ['internal.lan'],
    });

    await refetch(ADMIN, 1);

    expect(safeRequester.mock.calls[0][1].allowPrivateHosts).toEqual([]);
  });

  it('propagates a transport failure instead of swallowing it', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockRejectedValue(new Error('Request timed out'));
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await expect(refetch(OWNER, 1)).rejects.toThrow(/timed out/);
    expect(prisma.clip.update).not.toHaveBeenCalled();
  });

  it('rejects a non-HTML source', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(
      htmlResponse('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } }),
    );
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await expect(refetch(OWNER, 1)).rejects.toThrow(ClipValidationError);
  });

  it('rejects an error status', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse('', { statusCode: 500 }));
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await expect(refetch(OWNER, 1)).rejects.toThrow(ClipValidationError);
  });
});

/**
 * The SSRF protection lives inside requestSafeResource. These wire the real implementation to a
 * stub resolver so the refetch path is proven to inherit it, rather than only proving that the
 * right options object was passed.
 */
describe('clip refetch address safety', () => {
  const privateAddresses: Array<[string, { address: string; family: 4 | 6 }]> = [
    ['IPv4 loopback', { address: '127.0.0.1', family: 4 }],
    ['IPv4 private', { address: '10.1.2.3', family: 4 }],
    ['IPv4 link-local metadata', { address: '169.254.169.254', family: 4 }],
    ['IPv6 loopback', { address: '::1', family: 6 }],
    ['IPv6 unique local', { address: 'fd00::1', family: 6 }],
  ];

  for (const [label, address] of privateAddresses) {
    it(`refuses to fetch a host resolving to ${label}`, async () => {
      const prisma = stubPrisma();
      const safeRequester = ((url: string, options: never) => requestSafeResource(url, options, {
        lookup: async () => [address],
      })) as never;
      const refetch = createClipRefetch({ prisma: prisma as never, safeRequester, privateOutboundHosts: [] });

      await expect(refetch(OWNER, 1)).rejects.toThrow();
      expect(prisma.clip.update).not.toHaveBeenCalled();
    });
  }
});

describe('clip refetch content handling', () => {
  it('sanitizes the refetched body before storing it', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse(
      `<!doctype html><html><head><title>T</title></head><body><article>
        <p>Fresh body paragraph long enough to survive scoring and be kept as main content.</p>
        <script>steal()</script>
      </article></body></html>`,
    ));
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await refetch(OWNER, 1);

    const written = prisma.clip.update.mock.calls[0][0].data;
    expect(written.contentHtml).not.toContain('<script');
  });

  it('advances contentVersion when the body changed', async () => {
    const prisma = stubPrisma({ contentHash: 'stale', contentVersion: 4 });
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse());
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await refetch(OWNER, 1);

    expect(prisma.clip.update.mock.calls[0][0].data.contentVersion).toBe(5);
  });

  it('leaves contentVersion alone when the body is identical', async () => {
    // Prime the row with the hash the refetch will compute, so nothing actually changed.
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse());
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await refetch(OWNER, 1);
    const firstHash = prisma.clip.update.mock.calls[0][0].data.contentHash;

    const unchanged = stubPrisma({ contentHash: firstHash, contentVersion: 4 });
    const second = createClipRefetch({ prisma: unchanged as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });
    await second(OWNER, 1);

    // Highlights anchored against unchanged text must not all go stale on every refetch.
    expect(unchanged.clip.update.mock.calls[0][0].data.contentVersion).toBe(4);
  });

  it('returns null for a clip owned by someone else', async () => {
    const prisma = stubPrisma(null);
    const safeRequester = vi.fn();
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await expect(refetch(OWNER, 1)).resolves.toBeNull();
    expect(safeRequester).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the authenticated user', async () => {
    const prisma = stubPrisma();
    const safeRequester = vi.fn().mockResolvedValue(htmlResponse());
    const refetch = createClipRefetch({ prisma: prisma as never, safeRequester: safeRequester as never, privateOutboundHosts: [] });

    await refetch(OWNER, 1);

    expect(prisma.clip.findFirst).toHaveBeenCalledWith({ where: { id: 1, userId: 7 } });
  });
});
