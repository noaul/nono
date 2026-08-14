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

  it('renders a compact dashboard with prioritised actions and grouped tools', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, parentId: null, name: '常用', sortOrder: 1, locked: false },
        { id: 2, userId: 1, parentId: 1, name: '工具', sortOrder: 1, locked: false },
        { id: 3, userId: 1, parentId: 1, name: '私密', sortOrder: 2, locked: true },
      ])
      .mockResolvedValueOnce([
        { id: 1, folderId: 2, name: 'NoNo', url: 'https://noaul.com', sortOrder: 1 },
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
    expect(wrapper.find('.dashboard-overview-header').exists()).toBe(true);
    expect(wrapper.findAll('.ops-metric-card')).toHaveLength(4);
    expect(wrapper.findAll('.ops-metric-card strong').map((metric) => metric.text())).toEqual(['1', '2', '1', '1']);
    expect(wrapper.findAll('.dashboard-primary-action')).toHaveLength(4);
    expect(wrapper.findAll('.dashboard-tool-link')).toHaveLength(7);
    expect(wrapper.find('.dashboard-shortcuts-panel').exists()).toBe(false);
    expect(wrapper.find('.dashboard-shortcut-grid').exists()).toBe(false);

    const destinations = wrapper.findAll('.dashboard-primary-action, .dashboard-tool-link').map((link) => link.attributes('href'));
    expect(destinations).toEqual(expect.arrayContaining([
      '/admin/links#new-bookmark',
      '/admin/automation',
      '/admin/notabs',
      '/admin/links#folder-management',
      '/admin/links#bookmark-tools',
      '/admin/llm',
      '/admin/account#api-tokens',
      '/admin/notifications',
      '/nodesk',
      '/nomoney',
    ]));
    wrapper.unmount();
  });
});
