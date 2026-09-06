import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
const confirm = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm }),
}));

vi.mock('@/composables/useToasts', () => ({
  useToasts: () => ({ push: vi.fn() }),
}));

describe('TrashView', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    confirm.mockReset();
    confirm.mockResolvedValue(true);
  });

  it('restores a deleted folder and removes it from the recycle bin list', async () => {
    apiRequest.mockResolvedValueOnce([
      { id: 'trash-1', kind: 'folder', entityId: 2, label: 'Research', deletedAt: '2026-07-24T03:00:00.000Z' },
    ]).mockResolvedValueOnce({ ok: true });
    const { default: TrashView } = await import('../src/views/admin/TrashView.vue');
    const wrapper = mount(TrashView);
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="trash-item-trash-1"]').text()).toContain('Research');
    await wrapper.get('[data-testid="restore-trash-trash-1"]').trigger('click');
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/trash/trash-1/restore', { method: 'POST' });
    expect(wrapper.find('[data-testid="trash-item-trash-1"]').exists()).toBe(false);
  });

  it('renders and restores a deleted bookmark', async () => {
    apiRequest.mockResolvedValueOnce([
      { id: 'trash-bookmark', kind: 'bookmark', entityId: 11, label: 'Saved bookmark', deletedAt: '2026-08-15T03:00:00.000Z' },
    ]).mockResolvedValueOnce({ ok: true });
    const { default: TrashView } = await import('../src/views/admin/TrashView.vue');
    const wrapper = mount(TrashView);
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="trash-item-trash-bookmark"]').text()).toContain('Saved bookmark');
    await wrapper.get('[data-testid="restore-trash-trash-bookmark"]').trigger('click');
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/trash/trash-bookmark/restore', { method: 'POST' });
    expect(wrapper.find('[data-testid="trash-item-trash-bookmark"]').exists()).toBe(false);
  });
});
