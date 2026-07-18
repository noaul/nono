import { describe, expect, it, vi } from 'vitest';
import { checkLinksHealth, checkOneLink } from '../src/services/link-health.service.js';
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
  it('uses the safe requester and reports a redirect target as repairable', async () => {
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
      status: 'redirected',
      statusCode: 200,
      finalUrl: 'https://example.com/docs',
    });
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

  it.each([403, 405, 501])('falls back to a bodyless GET when HEAD returns %i', async (headStatus) => {
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
});
