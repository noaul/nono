import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ImportView from '../src/views/admin/ImportView.vue';

describe('ImportView', () => {
  it('hosts browser bookmark import and export as a content management tab', () => {
    const wrapper = mount(ImportView);

    expect(wrapper.get('.content-management-tab.active').text()).toBe('导入导出');
    expect(wrapper.text()).toContain('书签导入导出');
    expect(wrapper.find('[data-testid="preview-bookmarks"]').exists()).toBe(true);
  });
});
