import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SortableList from '../src/components/admin/SortableList.vue';
import FoldersView from '../src/views/admin/FoldersView.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/composables/useToasts', () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

function mountFoldersView() {
  return mount(FoldersView, {
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
      },
    },
  });
}

async function settle(wrapper: ReturnType<typeof mountFoldersView>) {
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
}

describe('FoldersView admin workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows folder link impact counts before deletion and removes locally', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工具', sortOrder: 100, passwordHint: '' },
        { id: 2, userId: 1, name: '文档', sortOrder: 90, passwordHint: '' },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'MDN', url: 'https://developer.mozilla.org/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountFoldersView();
    await settle(wrapper);

    expect(wrapper.text()).toContain('2 个书签');

    await wrapper.get('[data-testid="delete-folder-1"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/1', { method: 'DELETE' });
    expect(wrapper.text()).not.toContain('工具');
  });

  it('renders parent selector and indents child folders', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: 'Parent', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: 'Child', parentId: 1, sortOrder: 90 },
      ])
      .mockResolvedValueOnce([]);

    const wrapper = mountFoldersView();
    await settle(wrapper);

    expect(wrapper.find('[data-testid="folder-parent"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="folder-row-2"]').attributes('style')).toContain('--folder-depth: 1');
  });

  it('keeps folder drag ordering local until one explicit save', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: 'First', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: 'Second', parentId: null, sortOrder: 90 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountFoldersView();
    await settle(wrapper);
    await wrapper.get('[data-testid="start-folder-sort"]').trigger('click');
    const sortable = wrapper.findComponent(SortableList);
    expect(sortable.attributes('item-ids')).toBeUndefined();

    sortable.vm.$emit('reorder', [2, 1]);
    sortable.vm.$emit('reorder', [1, 2]);
    sortable.vm.$emit('reorder', [2, 1]);
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-testid="folder-row-2"]').find('.drag-handle').exists()).toBe(true);

    await wrapper.get('[data-testid="save-folder-sort"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids: [2, 1] }),
    });
  });

  it('ignores repeated folder save clicks while a reorder request is pending', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    const pendingSave = new Promise((resolve) => {
      resolveSave = resolve;
    });
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: 'First', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: 'Second', parentId: null, sortOrder: 90 },
      ])
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(pendingSave);

    const wrapper = mountFoldersView();
    await settle(wrapper);
    await wrapper.get('[data-testid="start-folder-sort"]').trigger('click');

    const saveButton = wrapper.get('[data-testid="save-folder-sort"]').element;
    saveButton.dispatchEvent(new MouseEvent('click'));
    saveButton.dispatchEvent(new MouseEvent('click'));
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledTimes(3);

    resolveSave({ ok: true });
    await settle(wrapper);
  });

  it('keeps the folder draft order available after a save failure', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: 'First', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: 'Second', parentId: null, sortOrder: 90 },
      ])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('network unavailable'));

    const wrapper = mountFoldersView();
    await settle(wrapper);
    await wrapper.get('[data-testid="start-folder-sort"]').trigger('click');
    wrapper.findComponent(SortableList).vm.$emit('reorder', [2, 1]);
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-testid="save-folder-sort"]').trigger('click');
    await settle(wrapper);

    const rows = wrapper.findAll('[data-testid^="folder-row-"]');
    expect(rows.map((row) => row.attributes('data-testid'))).toEqual(['folder-row-2', 'folder-row-1']);
    expect(wrapper.get('[data-testid="save-folder-sort"]').attributes('disabled')).toBeUndefined();
  });
});
