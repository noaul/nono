import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FolderIconPicker from '../src/components/admin/FolderIconPicker.vue';

describe('FolderIconPicker', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    document.body.innerHTML = '';
  });

  it('opens a searchable modal with recommended, recent, and all tabs', async () => {
    const wrapper = mount(FolderIconPicker, {
      props: { modelValue: '', testId: 'folder-picker' },
    });

    await wrapper.get('[data-testid="folder-picker"]').trigger('click');

    expect(document.body.querySelector('[data-testid="folder-icon-dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="folder-icon-search"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="folder-icon-tab-recommended"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="folder-icon-tab-recent"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="folder-icon-tab-all"]')).not.toBeNull();
    expect(document.body.querySelectorAll('[data-testid^="folder-icon-option-"]').length).toBeGreaterThan(0);
  });

  it('filters icons and emits the selected semantic icon before closing', async () => {
    const wrapper = mount(FolderIconPicker, {
      props: { modelValue: '', testId: 'folder-picker' },
    });

    await wrapper.get('[data-testid="folder-picker"]').trigger('click');
    const search = document.body.querySelector('[data-testid="folder-icon-search"]') as HTMLInputElement;
    search.value = '开发';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper.vm.$nextTick();

    const codeOption = document.body.querySelector('[data-testid="folder-icon-option-code"]') as HTMLButtonElement;
    expect(codeOption).not.toBeNull();
    await codeOption.click();

    expect(wrapper.emitted('update:modelValue')).toEqual([['code']]);
    expect(document.body.querySelector('[data-testid="folder-icon-dialog"]')).toBeNull();
  });

  it('remembers a selected icon in the recent tab', async () => {
    const wrapper = mount(FolderIconPicker, {
      props: { modelValue: '', testId: 'folder-picker' },
    });

    await wrapper.get('[data-testid="folder-picker"]').trigger('click');
    await (document.body.querySelector('[data-testid="folder-icon-option-code"]') as HTMLButtonElement).click();
    await wrapper.get('[data-testid="folder-picker"]').trigger('click');
    await (document.body.querySelector('[data-testid="folder-icon-tab-recent"]') as HTMLButtonElement).click();

    expect(document.body.querySelector('[data-testid="folder-icon-option-code"]')).not.toBeNull();
  });
});
