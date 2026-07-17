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

  it('uses a fixed admin surface without loading public appearance settings', async () => {
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

    expect(mockedApiRequest).not.toHaveBeenCalled();
    expect(wrapper.get('.app-workbench').attributes('style')).toBeUndefined();
    expect(wrapper.findAllComponents(RouterLinkStub)[0].props('to')).toBe('/');
    expect(wrapper.get('.admin-nav').text()).toContain('Notab 管理文件夹书签管理');
    expect(wrapper.get('.admin-nav').text()).not.toContain('新增书签');
    expect(wrapper.get('.admin-nav').text()).not.toContain('Nodesk');
    expect(wrapper.get('.admin-nav').text()).not.toContain('导入导出');
  });
});
