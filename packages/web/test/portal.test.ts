import { describe, expect, it } from 'vitest';
import { getPortalSettings, safeHttpUrl, safeImageUrl } from '../src/utils/portal';

describe('portal settings', () => {
  it('uses the same-origin Nodesk path by default', () => {
    expect(getPortalSettings({}).url).toBe('/nodesk');
  });

  it('normalizes portal values and uses a deployment fallback URL', () => {
    expect(getPortalSettings({}, 'https://blog.example.com')).toMatchObject({
      enabled: true,
      url: 'https://blog.example.com/',
      label: '前往 Nodesk',
      imageUrl: '',
      openInNewTab: false,
    });
  });

  it('allows web and same-site paths while rejecting unsafe protocols', () => {
    expect(safeHttpUrl('/nodesk')).toBe('/nodesk');
    expect(safeHttpUrl('https://example.com/nodesk')).toBe('https://example.com/nodesk');
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
    expect(safeImageUrl('data:image/svg+xml,test')).toBe('');
  });
});
