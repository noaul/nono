import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from '../src/components/AdminLayout.vue';
import { apiRequest } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe('AdminLayout appearance settings', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  it('applies saved admin surface variables to the workbench shell', async () => {
    mockedApiRequest.mockResolvedValue({
      id: 1,
      userId: 1,
      name: 'Nono',
      description: '',
      slug: 'admin',
      backgroundColor: '#000000',
      fontColor: '#ffffff',
      searchUrlTemplate: 'https://www.google.com/search?q={query}',
      localSearchFirst: true,
      settings: {
        appearance: {
          adminRadius: 14,
          adminOpacity: 86,
          adminBlur: 18,
        },
      },
    });

    const wrapper = mount(AdminLayout, {
      props: { title: '站点配置' },
      global: {
        stubs: { RouterLink: RouterLinkStub },
        plugins: [createPinia()],
        mocks: {
          $route: { path: '/admin/site' },
        },
      },
    });

    await flushPromises();

    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/site');
    expect(wrapper.get('.app-workbench').attributes('style')).toContain('--admin-surface-radius: 14px');
    expect(wrapper.get('.app-workbench').attributes('style')).toContain('--admin-surface-opacity: 0.86');
    expect(wrapper.get('.app-workbench').attributes('style')).toContain('--admin-surface-blur: 18px');
    expect(wrapper.findAllComponents(RouterLinkStub)[0].props('to')).toBe('/');
    expect(wrapper.get('.admin-nav').text()).toContain('Notab 管理文件夹新增书签书签管理');
    expect(wrapper.get('.admin-nav').text()).not.toContain('Nodesk');
    expect(wrapper.get('.admin-nav').text()).not.toContain('导入导出');
  });
});
