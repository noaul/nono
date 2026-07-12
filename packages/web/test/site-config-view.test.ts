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
            cardRadius: 12, cardOpacity: 58, cardBlur: 10,
            searchRadius: 30, searchOpacity: 32, searchBlur: 16,
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
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--public-modal-radius: 14px');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--public-tab-radius: 24px');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('style')).toContain('--admin-surface-radius: 10px');
    expect((wrapper.get('[data-testid="portal-label"]').element as HTMLInputElement).value).toBe('我的博客');
    expect((wrapper.get('[data-testid="portal-url"]').element as HTMLInputElement).value).toBe('https://blog.example.com/');
    await wrapper.get('[data-testid="card-radius"]').setValue('16');
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
      cardRadius: 16,
      cardOpacity: 58,
      cardBlur: 10,
      searchRadius: 30,
      searchOpacity: 32,
      searchBlur: 16,
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
});
