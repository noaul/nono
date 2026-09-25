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
    mockedApiRequest.mockResolvedValue({ items: [], unreadCount: 0, generatedAt: '2026-07-18T08:00:00.000Z' });
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

    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/notifications?limit=5');
    expect(wrapper.get('.admin-shell').attributes('style')).toBeUndefined();
    expect(wrapper.findAllComponents(RouterLinkStub)[0].props('to')).toBe('/');
    expect(wrapper.get('.admin-nav').text()).toContain('内容管理');
    expect(wrapper.get('.admin-nav').text()).not.toContain('NoTab 管理');
    expect(wrapper.get('.admin-nav').findAll('.nav-button').filter((item) => item.text() === '内容管理')).toHaveLength(1);
    expect(wrapper.get('.admin-nav').text()).not.toContain('新增书签');
    expect(wrapper.get('.admin-nav').text()).not.toContain('NoDesk');
    // Import and trash are content tabs now, and LLM lives in Account, so none get a nav row.
    for (const merged of ['导入导出', '回收站', 'LLM']) expect(wrapper.get('.admin-nav').text()).not.toContain(merged);
    expect(wrapper.get('.admin-nav').text()).toContain('通知中心');
    // One shell class only: the admin surface no longer stacks skins.
    expect(wrapper.get('.admin-shell').classes()).toEqual(['admin-shell']);
  });
});
