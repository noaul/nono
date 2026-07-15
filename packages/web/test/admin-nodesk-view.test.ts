import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NodeskView from '../src/views/admin/NodeskView.vue';

function mountNodeskView() {
  return mount(NodeskView, {
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
      },
    },
  });
}

describe('NodeskView embedded management', () => {
  it('switches Nodesk management pages inside the admin iframe', async () => {
    const wrapper = mountNodeskView();
    const tabs = wrapper.findAll('[role="tab"]');

    expect(tabs.map((tab) => tab.text())).toEqual([
      '站点与主页',
      '新增文章',
      '文章管理',
      '项目管理',
      '分享管理',
      '博主管理',
      '图集管理',
      '片段管理',
      '关于页管理',
    ]);
    expect(wrapper.get('.nodesk-admin-frame').attributes('src')).toBe('/nodesk');

    await tabs[2].trigger('click');

    expect(tabs[2].attributes('aria-selected')).toBe('true');
    expect(wrapper.get('.nodesk-admin-frame').attributes('src')).toBe('/nodesk/blog');
    expect(wrapper.findAll('a')).toHaveLength(0);
  });
});
