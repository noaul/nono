import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToastHost from '../src/components/admin/ToastHost.vue';
import { clearToasts, notifyError, notifySuccess } from '../src/composables/useToasts';

describe('admin feedback primitives', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearToasts();
  });

  it('renders success and error toasts and auto dismisses them', async () => {
    const wrapper = mount(ToastHost);

    notifySuccess('书签已新增');
    notifyError('保存失败');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('书签已新增');
    expect(wrapper.text()).toContain('保存失败');

    vi.advanceTimersByTime(4200);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('书签已新增');
    expect(wrapper.text()).not.toContain('保存失败');
  });
});
