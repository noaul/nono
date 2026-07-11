import { describe, expect, it } from 'vitest';
import { getPortalSettings, safeHttpUrl, safeImageUrl } from '../src/utils/portal';

describe('portal settings', () => {
  it('normalizes portal values and uses a deployment fallback URL', () => {
    expect(getPortalSettings({}, 'https://blog.example.com')).toMatchObject({
      enabled: true,
      url: 'https://blog.example.com/',
      label: '前往博客',
      imageUrl: '',
      openInNewTab: false,
    });
  });

  it('allows web and same-site paths while rejecting unsafe protocols', () => {
    expect(safeHttpUrl('/blog')).toBe('/blog');
    expect(safeHttpUrl('https://example.com/blog')).toBe('https://example.com/blog');
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
    expect(safeImageUrl('data:image/svg+xml,test')).toBe('');
  });
});
