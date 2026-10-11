import { describe, expect, it } from 'vitest';
import { buildSearchUrl, unwrapApiResponse } from '../src/api/client';

describe('web api helpers', () => {
  it('unwraps the unified API envelope', () => {
    expect(unwrapApiResponse({ code: 0, data: { ok: true }, message: '' })).toEqual({ ok: true });
  });

  it('throws message from non-zero API envelopes', () => {
    expect(() => unwrapApiResponse({ code: 401, data: null, message: 'Authentication required' })).toThrow('Authentication required');
  });

  it('uses Google as the default external search target', () => {
    expect(buildSearchUrl('vite vue', undefined)).toBe('https://www.google.com/search?q=vite%20vue');
    expect(buildSearchUrl('vite vue', 'https://example.test/search?q={query}')).toBe('https://example.test/search?q=vite%20vue');
  });

  it('falls back to the default engine for non-http(s) search templates', () => {
    const fallback = 'https://www.google.com/search?q=vite';
    expect(buildSearchUrl('vite', 'javascript:alert({query})')).toBe(fallback);
    expect(buildSearchUrl('vite', ' JavaScript:alert({query})')).toBe(fallback);
    expect(buildSearchUrl('vite', 'data:text/html,{query}')).toBe(fallback);
    expect(buildSearchUrl('vite', '//evil.example/?q={query}')).toBe(fallback);
    expect(buildSearchUrl('vite', 'http://example.test/?q={query}')).toBe('http://example.test/?q=vite');
  });

  it('exposes phase 2 admin operation types', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/api/types.ts'), 'utf8');

    expect(source).toContain('export interface BookmarkImportPreview');
    expect(source).toContain('export interface DuplicateLinkGroup');
    expect(source).toContain('export interface BulkLinkResult');
  });
});
