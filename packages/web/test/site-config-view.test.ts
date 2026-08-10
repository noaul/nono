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

describe('SiteConfigView site controls', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('keeps site and portal settings while appearance editing lives on the public homepage', async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        name: 'NoNo',
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
            bookmarkTextSize: 14,
            notabTextColor: '#dbeafe',
            notabTextSize: 15,
            folderTextColor: '#e0f2fe',
            folderTextSize: 18,
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
        name: 'NoNo',
        settings: { appearance: { cardRadius: 16 } },
      });

    const wrapper = mountView();
    await settle(wrapper);

    expect(wrapper.find('[data-testid="card-radius"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="theme-winter-glow"]').exists()).toBe(false);
    expect((wrapper.get('[data-testid="portal-label"]').element as HTMLInputElement).value).toBe('我的博客');
    expect((wrapper.get('[data-testid="portal-url"]').element as HTMLInputElement).value).toBe('https://blog.example.com/');
    await wrapper.get('[data-testid="portal-label"]').setValue('前往新博客');
    await wrapper.get('form').trigger('submit');
    await settle(wrapper);

    const options = apiRequest.mock.calls[1][1];
    expect(apiRequest.mock.calls[1][0]).toBe('/api/admin/site');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body).settings.appearance).toMatchObject({
      cardColor: '#dbeafe',
      searchColor: '#fef3c7',
      bookmarkTextColor: '#f8fafc',
      notabTextColor: '#dbeafe',
      folderTextColor: '#e0f2fe',
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

  it('adds custom search engines, toggles them, and persists the default engine', async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        name: 'NoNo',
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
      .mockResolvedValueOnce({ id: 1, userId: 1, name: 'NoNo', settings: {} });

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
