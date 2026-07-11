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
          appearance: { cardRadius: 12, cardOpacity: 58, cardBlur: 10, searchRadius: 30, searchOpacity: 32, searchBlur: 16 },
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
    expect((wrapper.get('[data-testid="portal-label"]').element as HTMLInputElement).value).toBe('我的博客');
    expect((wrapper.get('[data-testid="portal-url"]').element as HTMLInputElement).value).toBe('https://blog.example.com/');
    await wrapper.get('[data-testid="card-radius"]').setValue('16');
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
    });
    expect(JSON.parse(options.body).settings.portal).toMatchObject({
      enabled: true,
      url: 'https://blog.example.com/',
      label: '前往新博客',
      imageUrl: 'https://cdn.example.com/avatar.png',
      openInNewTab: true,
    });
  });
});
