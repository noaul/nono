import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../src/components/admin/ConfirmDialog.vue';
import ToastHost from '../src/components/admin/ToastHost.vue';
import { clearConfirmState, useConfirm } from '../src/composables/useConfirm';
import { clearToasts, notifyError, notifySuccess } from '../src/composables/useToasts';

describe('admin feedback primitives', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearToasts();
  });

  afterEach(() => {
    vi.useRealTimers();
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

describe('admin confirmation primitive', () => {
  beforeEach(() => {
    clearConfirmState();
    document.body.innerHTML = '';
  });

  it('resolves true when accepted and false when cancelled', async () => {
    const wrapper = mount(ConfirmDialog, { attachTo: document.body });
    const confirmApi = useConfirm();

    const accepted = confirmApi.confirm({
      title: '删除书签',
      message: '确定删除 GitHub 吗？',
      confirmText: '删除',
      tone: 'danger',
    });

    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain('删除书签');
    expect(document.body.textContent).toContain('确定删除 GitHub 吗？');

    await document.querySelector<HTMLButtonElement>('[data-testid="confirm-accept"]')!.click();
    await expect(accepted).resolves.toBe(true);

    const cancelled = confirmApi.confirm({
      title: '删除文件夹',
      message: '确定删除 常用工具 吗？',
      confirmText: '删除',
      tone: 'danger',
    });

    await wrapper.vm.$nextTick();
    await document.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
    await expect(cancelled).resolves.toBe(false);
  });
});
