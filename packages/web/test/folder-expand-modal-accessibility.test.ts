import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FolderExpandModal from '../src/components/FolderExpandModal.vue';

describe('FolderExpandModal accessibility', () => {
  it('locks page scrolling and restores it with the previous focus on unmount', async () => {
    document.body.innerHTML = '';
    document.body.style.overflow = 'clip';
    const invoker = document.createElement('button');
    document.body.append(invoker);
    invoker.focus();

    const wrapper = mount(FolderExpandModal, {
      attachTo: document.body,
      props: {
        folder: { id: 1, userId: 1, parentId: null, name: '常用', sortOrder: 1, locked: false, links: [] } as any,
      },
    });
    await wrapper.vm.$nextTick();

    expect(document.body.style.overflow).toBe('hidden');
    expect(wrapper.get('[role="dialog"]').element.contains(document.activeElement)).toBe(true);
    expect(wrapper.get('[title="关闭"]').attributes('aria-label')).toBe('关闭文件夹');

    wrapper.unmount();
    expect(document.body.style.overflow).toBe('clip');
    expect(document.activeElement).toBe(invoker);
    document.body.style.overflow = '';
  });
});
