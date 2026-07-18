import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AutomationView from '../src/views/admin/AutomationView.vue';

describe('AutomationView', () => {
  it('hosts browser bookmark import and export outside the bookmark list', () => {
    const wrapper = mount(AutomationView);

    expect(wrapper.text()).toContain('导入导出');
    expect(wrapper.text()).toContain('书签导入导出');
    expect(wrapper.find('[data-testid="preview-bookmarks"]').exists()).toBe(true);
  });
});
