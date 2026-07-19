import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppearanceEditor from '../src/components/admin/AppearanceEditor.vue';
import { appearanceDefaults } from '../src/utils/appearance';

describe('admin performance contract', () => {
  it('keeps grouped controls compact by omitting the live preview', () => {
    const wrapper = mount(AppearanceEditor, {
      props: {
        appearance: { ...appearanceDefaults },
      },
    });

    expect(wrapper.find('[data-testid="appearance-preview"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('搜索框、Notab 与文件夹标签栏');
    expect(wrapper.text()).not.toContain('文件夹卡片与弹窗');
    expect(wrapper.find('[data-testid="admin-radius"]').exists()).toBe(false);
  });
});
