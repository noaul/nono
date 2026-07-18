import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppearanceSettingsDrawer from '../src/components/AppearanceSettingsDrawer.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

const site = {
  id: 1,
  userId: 1,
  name: 'Nono',
  description: '导航',
  slug: 'admin',
  backgroundColor: '#090a0f',
  fontColor: '#ffffff',
  searchUrlTemplate: 'https://www.google.com/search?q={query}',
  localSearchFirst: true,
  settings: { analytics: { enabled: true } },
};

describe('AppearanceSettingsDrawer', () => {
  beforeEach(() => apiRequest.mockReset());

  it('applies and saves a complete theme without dropping unrelated settings', async () => {
    apiRequest.mockResolvedValue({ ...site, backgroundColor: '#edf3f8', fontColor: '#423832' });
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });

    expect(wrapper.findAll('[data-testid^="theme-"]')).toHaveLength(6);
    await wrapper.get('[data-testid="theme-winter-glow"]').trigger('click');
    expect((wrapper.get('[data-testid="card-color"]').element as HTMLInputElement).value).toBe('#fffaf3');
    expect((wrapper.get('[data-testid="search-color"]').element as HTMLInputElement).value).toBe('#fffdf8');
    await wrapper.get('[data-testid="appearance-save"]').trigger('click');
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    const [url, options] = apiRequest.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(url).toBe('/api/admin/site');
    expect(options.method).toBe('PUT');
    expect(payload.backgroundColor).toBe('#edf3f8');
    expect(payload.fontColor).toBe('#423832');
    expect(payload.settings.analytics).toEqual({ enabled: true });
    expect(payload.settings.theme).toEqual({ id: 'winter-glow', accent: '#d97745' });
    expect(payload.settings.appearance).toMatchObject({
      cardColor: '#fffaf3',
      searchColor: '#fffdf8',
      bookmarkTextColor: '#3f352f',
      notabTextColor: '#4a3f38',
      folderTextColor: '#493a32',
    });
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });

  it('keeps the admin jump inside the drawer and opens it in a new window', () => {
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });
    const link = wrapper.get('[data-testid="appearance-admin-link"]');

    expect(link.attributes('href')).toBe('/admin');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noreferrer');
  });
});
