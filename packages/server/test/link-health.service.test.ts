import { describe, expect, it, vi } from 'vitest';
import { checkLinksHealth, checkOneLink, shouldSkipLinkHealthCheck } from '../src/services/link-health.service.js';
import type { LinkRecord } from '../src/services/repository.js';

function link(overrides: Partial<LinkRecord> = {}): LinkRecord {
  const now = new Date('2026-07-18T08:00:00.000Z');
  return {
    id: 1,
    folderId: 1,
    name: 'Example',
    url: 'http://example.com/docs',
    icon: '',
    description: '',
    sortOrder: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('link health checks', () => {
  it.each([
    'http://localhost:3000/',
    'http://app.localhost/',
    'http://127.0.0.1:8080/',
    'http://127.23.4.5/',
    'http://10.0.0.8/',
    'http://172.16.0.1/',
    'http://172.31.255.254/',
    'http://192.168.223.1/',
    'http://169.254.1.1/',
    'http://[::1]/',
    'http://printer.local/',
  ])('identifies local URL %s as excluded from health checks', (url) => {
    expect(shouldSkipLinkHealthCheck(url)).toBe(true);
  });

  it('does not request disabled or local links', async () => {
    const requester = vi.fn();

    const result = await checkLinksHealth([
      link({ id: 1, url: 'https://disabled.example/', healthCheckEnabled: false }),
      link({ id: 2, url: 'http://192.168.223.1/' }),
      link({ id: 3, url: 'https://public.example/' }),
    ], requester.mockResolvedValue({ statusCode: 200, headers: {}, body: Buffer.alloc(0), finalUrl: 'https://public.example/' }) as any);

    expect(requester).toHaveBeenCalledTimes(1);
    expect(requester).toHaveBeenCalledWith('https://public.example/', expect.any(Object));
    expect(result.summary.total).toBe(1);
    expect(result.results.map((item) => item.id)).toEqual([3]);
  });

  it('treats a reachable redirect target as healthy', async () => {
    const requester = vi.fn(async () => ({
      statusCode: 200,
      headers: {},
      body: Buffer.alloc(0),
      finalUrl: 'https://example.com/docs',
    }));

    const result = await checkOneLink(link(), requester as any);

    expect(requester).toHaveBeenCalledWith(
      'http://example.com/docs',
      expect.objectContaining({
        method: 'HEAD',
        timeoutMs: 5000,
        discardBody: true,
        headers: expect.objectContaining({ 'user-agent': expect.stringContaining('Nono-Link-Health') }),
      }),
    );
    expect(result).toMatchObject({
      status: 'ok',
      statusCode: 200,
    });
    expect(result).not.toHaveProperty('finalUrl');
  });

  it('passes the explicit private-host allowlist to the safe requester', async () => {
    const requester = vi.fn(async (url: string) => ({ statusCode: 200, headers: {}, body: Buffer.alloc(0), finalUrl: url }));

    await (checkOneLink as any)(link({ url: 'http://bookmarks.lan/' }), requester, { allowPrivateHosts: ['bookmarks.lan'] });

    expect(requester).toHaveBeenCalledWith(
      'http://bookmarks.lan/',
      expect.objectContaining({ allowPrivateHosts: ['bookmarks.lan'] }),
    );
  });

  it('limits concurrent outbound checks', async () => {
    let active = 0;
    let maximum = 0;
    const requester = vi.fn(async (url: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { statusCode: 200, headers: {}, body: Buffer.alloc(0), finalUrl: url };
    });
    const links = Array.from({ length: 6 }, (_, index) => link({ id: index + 1, url: `https://example.com/${index}` }));

    await (checkLinksHealth as any)(links, requester, { concurrency: 2 });

    expect(maximum).toBe(2);
  });

  it.each([403, 404, 405, 501])('falls back to a bodyless GET when HEAD returns %i', async (headStatus) => {
    const requester = vi.fn()
      .mockResolvedValueOnce({ statusCode: headStatus, headers: {}, body: Buffer.alloc(0), finalUrl: 'https://example.com/docs' })
      .mockResolvedValueOnce({ statusCode: 200, headers: {}, body: Buffer.alloc(0), finalUrl: 'https://example.com/docs' });

    const result = await checkOneLink(link({ url: 'https://example.com/docs' }), requester as any);

    expect(result.status).toBe('ok');
    expect(requester).toHaveBeenNthCalledWith(2, 'https://example.com/docs', expect.objectContaining({
      method: 'GET',
      discardBody: true,
    }));
  });

  it.each([401, 403, 429])('reports HTTP %i as restricted when GET is also blocked', async (statusCode) => {
    const requester = vi.fn()
      .mockResolvedValueOnce({ statusCode, headers: {}, body: Buffer.alloc(0), finalUrl: 'https://example.com/docs' })
      .mockResolvedValueOnce({ statusCode, headers: {}, body: Buffer.alloc(0), finalUrl: 'https://example.com/docs' });

    const result = await checkLinksHealth([link({ url: 'https://example.com/docs' })], requester as any);

    expect(result.results[0]).toMatchObject({ status: 'restricted', statusCode });
    expect(result.summary.restricted).toBe(1);
    expect(result.summary.broken).toBe(0);
  });
});
