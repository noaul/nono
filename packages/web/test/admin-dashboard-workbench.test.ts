import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from '../src/components/AdminLayout.vue';
import AdminDashboard from '../src/views/admin/AdminDashboard.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

describe('admin dashboard workbench', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiRequest.mockReset();
  });

  it('highlights only the exact sidebar route', async () => {
    apiRequest.mockResolvedValue({ settings: {} });
    const page = { template: '<div />' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: page },
        {
          path: '/admin',
          component: { template: '<router-view />' },
          children: [
            { path: '', component: { template: '<div>overview</div>' } },
            { path: 'site', component: page },
            { path: 'notabs', component: { template: '<div>notabs</div>' } },
            { path: 'folders', component: page },
            { path: 'links', component: page },
            { path: 'automation', component: page },
            { path: 'llm', component: page },
            { path: 'tokens', component: page },
            { path: 'account', component: page },
          ],
        },
      ],
    });
    await router.push('/admin/notabs');
    await router.isReady();

    const wrapper = mount(AdminLayout, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const overview = wrapper.findAll('.nav-button').find((link) => link.text().includes('总览'));
    const contentManagement = wrapper.findAll('.nav-button').find((link) => link.text().includes('书签管理'));
    expect(overview?.classes()).not.toContain('router-link-active');
    expect(contentManagement?.classes()).toContain('router-link-active');
    wrapper.unmount();
  });

  it('renders the selected quick-workbench dashboard without the operations hero', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, parentId: null, name: '常用', sortOrder: 1, locked: false },
        { id: 2, userId: 1, parentId: 1, name: '工具', sortOrder: 1, locked: false },
        { id: 3, userId: 1, parentId: 1, name: '私密', sortOrder: 2, locked: true },
      ])
      .mockResolvedValueOnce([
        { id: 1, folderId: 2, name: 'Nono', url: 'https://noaul.com', sortOrder: 1 },
      ]);

    const wrapper = mount(AdminDashboard, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
          },
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('.dashboard-hero').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('运营中枢');
    expect(wrapper.findAll('.ops-metric-card')).toHaveLength(4);
    expect(wrapper.findAll('.dashboard-shortcut')).toHaveLength(11);
    expect(wrapper.text()).toContain('1 个 Notab');
    expect(wrapper.text()).toContain('2 个文件夹');
    expect(wrapper.text()).toContain('1 个书签');
    expect(wrapper.text()).toContain('1 个加密');

    const destinations = wrapper.findAll('.dashboard-shortcut').map((link) => link.attributes('href'));
    expect(destinations).toEqual(expect.arrayContaining([
      '/admin/links#new-bookmark',
      '/admin/automation',
      '/admin/notabs',
      '/admin/folders',
      '/admin/links#bookmark-tools',
      '/admin/llm',
      '/admin/tokens',
      '/admin/notifications',
      '/nodesk',
      '/nomoney',
    ]));
    wrapper.unmount();
  });
});
