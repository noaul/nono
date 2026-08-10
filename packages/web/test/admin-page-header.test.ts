import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AdminPageHeader from '../src/components/admin/AdminPageHeader.vue';

describe('AdminPageHeader', () => {
  it('renders hierarchy and page actions without adding a nested card', () => {
    const wrapper = mount(AdminPageHeader, {
      props: {
        eyebrow: '内容管理',
        title: '书签管理',
        description: '按 NoTab 和文件夹整理书签。',
      },
      slots: { actions: '<button type="button">新增书签</button>' },
    });

    expect(wrapper.get('header').classes()).toContain('admin-page-header');
    // h2, not h1: AdminLayout's topbar owns the page's only h1.
    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.get('h2.admin-page-title').text()).toBe('书签管理');
    expect(wrapper.get('.admin-page-eyebrow').text()).toBe('内容管理');
    expect(wrapper.get('.admin-page-description').text()).toContain('按 NoTab');
    expect(wrapper.get('.admin-page-actions button').text()).toBe('新增书签');
    expect(wrapper.find('.admin-card').exists()).toBe(false);
  });
});
