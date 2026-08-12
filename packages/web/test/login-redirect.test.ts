import { describe, expect, it } from 'vitest';
import { requiresDocumentNavigation, resolveInternalRedirect } from '@/utils/redirect';

describe('login redirect', () => {
  it('returns to an internal application path after login', () => {
    expect(resolveInternalRedirect('/nostar', '/admin')).toBe('/nostar');
    expect(resolveInternalRedirect('/admin/llm?tab=nostar', '/admin')).toBe('/admin/llm?tab=nostar');
  });

  it('rejects external and protocol-relative redirects', () => {
    expect(resolveInternalRedirect('https://example.com', '/admin')).toBe('/admin');
    expect(resolveInternalRedirect('//example.com', '/admin')).toBe('/admin');
    expect(resolveInternalRedirect('/\\example.com', '/admin')).toBe('/admin');
  });

  it('uses a document navigation for applications mounted outside the Vue router', () => {
    expect(requiresDocumentNavigation('/nostar/')).toBe(true);
    expect(requiresDocumentNavigation('/nomoney/settings')).toBe(true);
    expect(requiresDocumentNavigation('/yumi/dashboard')).toBe(true);
    expect(requiresDocumentNavigation('/nodesk')).toBe(true);
    expect(requiresDocumentNavigation('/admin/llm')).toBe(false);
  });
});
