import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SortableList from '../src/components/admin/SortableList.vue';
import FoldersView from '../src/views/admin/FoldersView.vue';

const apiRequest = vi.fn();
const confirm = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm }),
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
    confirm.mockReset();
    confirm.mockResolvedValue(true);
  });

  it('shows subtree link impact counts and removes descendants locally', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工具', parentId: null, sortOrder: 100, passwordHint: '' },
        { id: 2, userId: 1, name: '开发文档', parentId: 1, sortOrder: 90, passwordHint: '' },
        { id: 3, userId: 1, name: '生活', parentId: null, sortOrder: 80, passwordHint: '' },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
        { id: 11, folderId: 2, name: 'MDN', url: 'https://developer.mozilla.org/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountFoldersView();
    await settle(wrapper);

    await wrapper.get('[data-testid="delete-folder-1"]').trigger('click');
    await settle(wrapper);

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('2 个书签'),
    }));
    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/1', { method: 'DELETE' });
    expect(wrapper.text()).not.toContain('工具');
    expect(wrapper.text()).not.toContain('开发文档');
    expect(wrapper.text()).toContain('生活');
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

  it('defaults to the first category and filters the management table by category', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: '开发', parentId: 1, sortOrder: 90 },
        { id: 3, userId: 1, name: '生活', parentId: null, sortOrder: 80 },
        { id: 4, userId: 1, name: '旅行', parentId: 3, sortOrder: 70 },
      ])
      .mockResolvedValueOnce([]);

    const wrapper = mountFoldersView();
    await settle(wrapper);

    expect(wrapper.get('[data-testid="folder-category-1"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="folder-row-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="folder-row-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="folder-row-3"]').exists()).toBe(false);

    await wrapper.get('[data-testid="folder-category-3"]').trigger('click');
    expect(wrapper.find('[data-testid="folder-row-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="folder-row-3"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="folder-row-4"]').exists()).toBe(true);
  });

  it('edits a folder inline with category and icon controls', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', icon: '📁', parentId: null, sortOrder: 100, passwordHint: '' },
        { id: 2, userId: 1, name: '开发', icon: '💻', parentId: 1, sortOrder: 90, passwordHint: '旧提示' },
        { id: 3, userId: 1, name: '生活', icon: '⭐', parentId: null, sortOrder: 80, passwordHint: '' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        id: 2,
        userId: 1,
        name: '工程',
        icon: '🚀',
        parentId: 3,
        sortOrder: 90,
        passwordHint: '新提示',
        description: '只收录工程开发资料',
      });

    const wrapper = mountFoldersView();
    await settle(wrapper);
    await wrapper.get('[data-testid="edit-folder-2"]').trigger('click');

    expect(wrapper.text()).toContain('新增文件夹');
    expect(wrapper.get('[data-testid="inline-folder-name-2"]').element).toBeInstanceOf(HTMLInputElement);
    expect(wrapper.get('[data-testid="inline-folder-parent-2"]').element).toBeInstanceOf(HTMLSelectElement);
    expect(wrapper.get('[data-testid="inline-folder-icon-picker-2"]').element).toBeInstanceOf(HTMLElement);

    await wrapper.get('[data-testid="inline-folder-name-2"]').setValue('工程');
    await wrapper.get('[data-testid="inline-folder-parent-2"]').setValue('3');
    await wrapper.get('[data-testid="inline-folder-hint-2"]').setValue('新提示');
    await wrapper.get('[data-testid="inline-folder-ai-prompt-2"]').setValue('只收录工程开发资料');
    await wrapper.get('[data-testid="inline-folder-icon-2-11"]').trigger('click');
    await wrapper.get('[data-testid="save-inline-folder-2"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/2', {
      method: 'PUT',
      body: JSON.stringify({
        parentId: 3,
        name: '工程',
        icon: '🚀',
        description: '只收录工程开发资料',
        passwordHint: '新提示',
      }),
    });
    expect(wrapper.text()).toContain('工程');
    expect(wrapper.find('[data-testid="inline-folder-name-2"]').exists()).toBe(false);
  });

  it('selects and bulk deletes folder trees without reloading lists', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: 'Root', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: 'Child', parentId: 1, sortOrder: 90 },
        { id: 3, userId: 1, name: 'Keep', parentId: null, sortOrder: 80 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 2, name: 'Delete', url: 'https://delete.example/', sortOrder: 100 },
        { id: 11, folderId: 3, name: 'Keep', url: 'https://keep.example/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({ deletedFolders: 2, deletedLinks: 1 });

    const wrapper = mountFoldersView();
    await settle(wrapper);
    await wrapper.get('[data-testid="select-folder-1"]').setValue(true);
    await wrapper.get('[data-testid="bulk-delete-folders"]').trigger('click');
    await settle(wrapper);

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('2 个文件夹和 1 个书签'),
    }));
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: [1] }),
    });
    expect(wrapper.text()).not.toContain('Root');
    expect(wrapper.text()).not.toContain('Child');
    expect(wrapper.text()).toContain('Keep');
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
