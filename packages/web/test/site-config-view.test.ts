import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SiteConfigView from '../src/views/admin/SiteConfigView.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

function mountView() {
  return mount(SiteConfigView, {
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
      },
    },
  });
}

async function settle(wrapper: ReturnType<typeof mountView>) {
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
}

describe('SiteConfigView appearance controls', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('loads appearance settings, previews them, and persists them under site settings', async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        name: 'Nono',
        description: '导航',
        slug: 'admin',
        backgroundColor: '#090a0f',
        fontColor: '#ffffff',
        searchUrlTemplate: 'https://www.google.com/search?q={query}',
        localSearchFirst: true,
        settings: {
          analytics: { enabled: true },
          appearance: {
            cardColor: '#dbeafe',
            cardRadius: 12, cardOpacity: 58, cardBlur: 10,
            searchColor: '#fef3c7',
            searchRadius: 30, searchOpacity: 32, searchBlur: 16,
            bookmarkTextColor: '#f8fafc',
            categoryTextColor: '#e0f2fe',
            tabColor: '#bfdbfe',
            modalRadius: 14, modalOpacity: 82, modalBlur: 22,
            tabRadius: 24, tabOpacity: 28, tabBlur: 12,
            adminRadius: 10, adminOpacity: 76, adminBlur: 9,
          },
          portal: {
            enabled: true,
            url: 'https://blog.example.com/',
            label: '我的博客',
            imageUrl: 'https://cdn.example.com/avatar.png',
            openInNewTab: true,
          },
        },
      })
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        name: 'Nono',
        settings: { appearance: { cardRadius: 16 } },
      });

    const wrapper = mountView();
    await settle(wrapper);

    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--public-card-radius: 12px');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--public-card-color-rgb: 219, 234, 254');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--public-search-color-rgb: 254, 243, 199');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--public-tab-color-rgb: 191, 219, 254');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--public-modal-radius: 14px');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--public-tab-radius: 24px');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--admin-surface-radius: 10px');
    expect((wrapper.get('[data-testid="portal-label"]').element as HTMLInputElement).value).toBe('我的博客');
    expect((wrapper.get('[data-testid="portal-url"]').element as HTMLInputElement).value).toBe('https://blog.example.com/');
    await wrapper.get('[data-testid="card-radius"]').setValue('16');
    await wrapper.get('[data-testid="card-color"]').setValue('#c4b5fd');
    await wrapper.get('[data-testid="search-color"]').setValue('#fde68a');
    await wrapper.get('[data-testid="bookmark-text-color"]').setValue('#f1f5f9');
    await wrapper.get('[data-testid="category-text-color"]').setValue('#fefce8');
    await wrapper.get('[data-testid="tab-color"]').setValue('#ddd6fe');
    await wrapper.get('[data-testid="modal-opacity"]').setValue('74');
    await wrapper.get('[data-testid="tab-blur"]').setValue('18');
    await wrapper.get('[data-testid="admin-radius"]').setValue('12');
    await wrapper.get('[data-testid="portal-label"]').setValue('前往新博客');
    await wrapper.get('form').trigger('submit');
    await settle(wrapper);

    const options = apiRequest.mock.calls[1][1];
    expect(apiRequest.mock.calls[1][0]).toBe('/api/admin/site');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body).settings.appearance).toMatchObject({
      cardColor: '#c4b5fd',
      cardRadius: 16,
      cardOpacity: 58,
      cardBlur: 10,
      searchColor: '#fde68a',
      searchRadius: 30,
      searchOpacity: 32,
      searchBlur: 16,
      bookmarkTextColor: '#f1f5f9',
      categoryTextColor: '#fefce8',
      tabColor: '#ddd6fe',
      modalRadius: 14,
      modalOpacity: 74,
      modalBlur: 22,
      tabRadius: 24,
      tabOpacity: 28,
      tabBlur: 18,
      adminRadius: 12,
      adminOpacity: 76,
      adminBlur: 9,
    });
    expect(JSON.parse(options.body).settings.analytics).toEqual({ enabled: true });
    expect(JSON.parse(options.body).settings.portal).toMatchObject({
      enabled: true,
      url: 'https://blog.example.com/',
      label: '前往新博客',
      imageUrl: 'https://cdn.example.com/avatar.png',
      openInNewTab: true,
    });
  });

  it('applies theme glass and text colors as a complete preset', async () => {
    apiRequest.mockResolvedValueOnce({
      id: 1,
      userId: 1,
      name: 'Nono',
      description: '导航',
      slug: 'admin',
      backgroundColor: '#090a0f',
      fontColor: '#ffffff',
      searchUrlTemplate: 'https://www.google.com/search?q={query}',
      localSearchFirst: true,
      settings: {},
    });

    const wrapper = mountView();
    await settle(wrapper);
    const themeCard = wrapper.get('[data-testid="theme-warm-paper"]');
    expect(themeCard.attributes('style')).toContain('--theme-card: #fff7ed');
    expect(themeCard.attributes('style')).toContain('--theme-search: #fffbeb');
    await themeCard.trigger('click');

    expect((wrapper.get('[data-testid="card-color"]').element as HTMLInputElement).value).toBe('#fff7ed');
    expect((wrapper.get('[data-testid="search-color"]').element as HTMLInputElement).value).toBe('#fffbeb');
    expect((wrapper.get('[data-testid="bookmark-text-color"]').element as HTMLInputElement).value).toBe('#3f2f1e');
    expect((wrapper.get('[data-testid="category-text-color"]').element as HTMLInputElement).value).toBe('#3f2f1e');
    expect((wrapper.get('[data-testid="tab-color"]').element as HTMLInputElement).value).toBe('#fff7ed');
  });

  it('adds custom search engines, toggles them, and persists the default engine', async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        name: 'Nono',
        description: '导航',
        slug: 'admin',
        backgroundColor: '#090a0f',
        fontColor: '#ffffff',
        searchUrlTemplate: 'https://www.google.com/search?q={query}',
        localSearchFirst: true,
        settings: {
          searchEngines: {
            defaultId: 'bing',
            items: [
              { id: 'google', label: 'Google', short: 'G', template: 'https://www.google.com/search?q={query}', enabled: true },
              { id: 'bing', label: 'Bing', short: 'B', template: 'https://www.bing.com/search?q={query}', enabled: true },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ id: 1, userId: 1, name: 'Nono', settings: {} });

    const wrapper = mountView();
    await settle(wrapper);

    expect(wrapper.get('[data-testid="default-search-engine-bing"]').attributes('checked')).toBeDefined();
    await wrapper.get('[data-testid="add-search-engine"]').trigger('click');
    const rows = wrapper.findAll('[data-testid^="search-engine-row-"]');
    const customRow = rows[rows.length - 1];
    await customRow.get('[data-testid="search-engine-label"]').setValue('站内文档');
    await customRow.get('[data-testid="search-engine-short"]').setValue('文');
    await customRow.get('[data-testid="search-engine-template"]').setValue('https://docs.example/search?q={query}');
    await customRow.get('[data-testid="search-engine-enabled"]').setValue(true);
    await customRow.get('[data-testid="search-engine-default"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    await settle(wrapper);

    const payload = JSON.parse(apiRequest.mock.calls[1][1].body);
    expect(payload.settings.searchEngines.defaultId).toMatch(/^custom-/);
    expect(payload.settings.searchEngines.items).toContainEqual(expect.objectContaining({
      label: '站内文档',
      short: '文',
      template: 'https://docs.example/search?q={query}',
      enabled: true,
    }));
  });
});
