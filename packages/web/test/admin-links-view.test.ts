import { mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SortableList from '../src/components/admin/SortableList.vue';
import LinksView from '../src/views/admin/LinksView.vue';

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

function mountLinksView(props: { mode?: 'create' | 'manage' } = {}) {
  return mount(LinksView, {
    props,
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
        RouterLink: RouterLinkStub,
      },
    },
  });
}

async function settle(wrapper: ReturnType<typeof mountLinksView>) {
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
}

describe('LinksView admin workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows loaded links and filters within the active folder', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工具', sortOrder: 100 },
        { id: 2, userId: 1, name: '文档', sortOrder: 90 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'MDN', url: 'https://developer.mozilla.org/', description: 'Web docs', sortOrder: 90 },
        { id: 12, folderId: 2, name: 'Vue', url: 'https://vuejs.org/', sortOrder: 80 },
      ]);

    const wrapper = mountLinksView();
    await settle(wrapper);

    expect(wrapper.text()).toContain('GitHub');
    expect(wrapper.text()).toContain('MDN');
    expect(wrapper.text()).not.toContain('Vue');

    await wrapper.get('[data-testid="link-search"]').setValue('docs');
    expect(wrapper.text()).not.toContain('GitHub');
    expect(wrapper.text()).toContain('MDN');
  });

  it('removes a deleted link from local state without reloading every list', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 1, userId: 1, name: '工具', sortOrder: 100 }])
      .mockResolvedValueOnce([{ id: 10, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 }])
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountLinksView();
    await settle(wrapper);

    await wrapper.get('[data-testid="delete-link-10"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/10', { method: 'DELETE' });
    expect(wrapper.text()).not.toContain('GitHub');
  });

  it('removes the redundant bulk move controls', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: 'Inbox', sortOrder: 100 },
        { id: 2, userId: 1, name: 'Archive', sortOrder: 90 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'One', url: 'https://one.example/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'Two', url: 'https://two.example/', sortOrder: 90 },
      ]);

    const wrapper = mountLinksView();
    await settle(wrapper);

    expect(wrapper.find('[data-testid="bulk-folder"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bulk-move"]').exists()).toBe(false);
  });

  it('filters bookmarks by category then folder and saves inline changes', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: '开发', parentId: 1, sortOrder: 90 },
        { id: 3, userId: 1, name: '生活', parentId: null, sortOrder: 80 },
        { id: 4, userId: 1, name: '旅行', parentId: 3, sortOrder: 70 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 2, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
        { id: 11, folderId: 4, name: 'Maps', url: 'https://maps.example/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({ id: 10, folderId: 4, name: 'GitHub Home', url: 'https://github.com/home', sortOrder: 100 });

    const wrapper = mountLinksView();
    await settle(wrapper);

    expect(wrapper.get('[data-testid="link-category-1"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('GitHub');
    expect(wrapper.text()).not.toContain('Maps');

    await wrapper.get('[data-testid="edit-link-10"]').trigger('click');
    await wrapper.get('[data-testid="inline-link-name-10"]').setValue('GitHub Home');
    await wrapper.get('[data-testid="inline-link-url-10"]').setValue('https://github.com/home');
    await wrapper.get('[data-testid="inline-link-category-10"]').setValue('3');
    await wrapper.get('[data-testid="inline-link-folder-10"]').setValue('4');
    await wrapper.get('[data-testid="save-inline-link-10"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/10', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'GitHub Home',
        url: 'https://github.com/home',
        folderId: 4,
      }),
    });

    await wrapper.get('[data-testid="link-category-3"]').trigger('click');
    expect(wrapper.text()).toContain('GitHub Home');
    expect(wrapper.text()).toContain('Maps');
  });

  it('edits folder and notab only after entering edit mode', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: '开发', parentId: 1, sortOrder: 90 },
        { id: 3, userId: 1, name: '设计', parentId: 1, sortOrder: 80 },
        { id: 4, userId: 1, name: '生活', parentId: null, sortOrder: 70 },
        { id: 5, userId: 1, name: '旅行', parentId: 4, sortOrder: 60 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 2, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
        { id: 11, folderId: 2, name: 'MDN', url: 'https://developer.mozilla.org/', sortOrder: 90 },
      ]);

    const wrapper = mountLinksView();
    await settle(wrapper);

    expect(wrapper.get('.bookmark-table .admin-table-head').text()).toContain('文件夹notab');
    expect(wrapper.find('[data-testid="link-folder-10"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="link-notab-10"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="link-name-10"]').element.tagName).toBe('SPAN');
    await wrapper.get('[data-testid="edit-link-10"]').trigger('click');
    expect(wrapper.get('[data-testid="inline-link-folder-10"]').element).toBeInstanceOf(HTMLSelectElement);
    expect(wrapper.get('[data-testid="inline-link-category-10"]').element).toBeInstanceOf(HTMLSelectElement);
  });

  it('creates a bookmark from the add row after choosing Notab and folder', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: '开发', parentId: 1, sortOrder: 90 },
        { id: 3, userId: 1, name: '生活', parentId: null, sortOrder: 80 },
        { id: 4, userId: 1, name: '旅行', parentId: 3, sortOrder: 70 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 20, folderId: 4, name: 'Maps', url: 'https://maps.example/', description: '', icon: '', sortOrder: -10 });

    const wrapper = mountLinksView();
    await settle(wrapper);

    expect(wrapper.text()).toContain('书签导入导出');
    expect(wrapper.text()).not.toContain('支持 Chrome、Edge、Firefox');
    expect(wrapper.text()).not.toContain('还没有选择文件');
    expect(wrapper.find('[data-testid="preview-bookmarks"]').exists()).toBe(true);
    await wrapper.get('[data-testid="add-link-row"]').trigger('click');
    await wrapper.get('[data-testid="new-link-category"]').setValue('3');
    expect(wrapper.get('[data-testid="new-link-folder"]').findAll('option').map((option) => option.text())).toEqual(['生活', '旅行']);
    await wrapper.get('[data-testid="new-link-folder"]').setValue('4');
    await wrapper.get('[data-testid="new-link-name"]').setValue('Maps');
    await wrapper.get('[data-testid="new-link-url"]').setValue('https://maps.example/');
    await wrapper.get('[data-testid="save-new-link"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links', {
      method: 'POST',
      body: JSON.stringify({
        folderId: 4,
        name: 'Maps',
        url: 'https://maps.example/',
        icon: '',
        description: '',
      }),
    });
    expect(wrapper.get('[data-testid="link-row-20"]').text()).toContain('Maps');
  });

  it('selects all visible bookmarks for batch deletion', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 1, userId: 1, name: 'Inbox', sortOrder: 100 }])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'One', url: 'https://one.example/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'Two', url: 'https://two.example/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({ deleted: 2 });

    const wrapper = mountLinksView();
    await settle(wrapper);
    await wrapper.get('[data-testid="select-all-links"]').trigger('click');
    expect(wrapper.text()).toContain('已选择 2 个书签');
    await wrapper.get('[data-testid="bulk-delete"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: [10, 11] }),
    });
    expect(wrapper.text()).not.toContain('One');
    expect(wrapper.text()).not.toContain('Two');
  });

  it('loads and displays duplicate link groups', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 1, userId: 1, name: 'Tools', sortOrder: 100 }])
      .mockResolvedValueOnce([{ id: 10, folderId: 1, name: 'GitHub A', url: 'https://github.com/', sortOrder: 100 }])
      .mockResolvedValueOnce({
        groups: [
          {
            url: 'https://github.com/',
            links: [
              { id: 10, folderId: 1, name: 'GitHub A', url: 'https://github.com/', sortOrder: 100 },
              { id: 11, folderId: 1, name: 'GitHub B', url: 'https://github.com/', sortOrder: 90 },
            ],
          },
        ],
      });

    const wrapper = mountLinksView();
    await settle(wrapper);
    await wrapper.get('[data-testid="load-duplicates"]').trigger('click');
    await settle(wrapper);

    expect(wrapper.text()).toContain('重复链接');
    expect(wrapper.text()).toContain('GitHub B');
  });

  it('checks selected link health and displays broken results', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 1, userId: 1, name: 'Tools', sortOrder: 100 }])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'OK', url: 'https://ok.example/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'Broken', url: 'https://broken.example/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({
        summary: { total: 1, ok: 0, broken: 1, timeout: 0, invalid: 0 },
        results: [{ id: 11, name: 'Broken', url: 'https://broken.example/', status: 'broken', statusCode: 404, checkedAt: '2026-06-04T10:00:00.000Z' }],
      });

    const wrapper = mountLinksView();
    await settle(wrapper);
    await wrapper.get('[data-testid="select-link-11"]').setValue(true);
    await wrapper.get('[data-testid="check-link-health"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/health-check', expect.objectContaining({ method: 'POST' }));
    expect(wrapper.text()).toContain('健康检查');
    expect(wrapper.text()).toContain('Broken');
    expect(wrapper.text()).toContain('404');
  });

  it('uses drag handles and saves bookmark ordering only once', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 1, userId: 1, name: 'Tools', sortOrder: 100 }])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'First', url: 'https://first.example/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'Second', url: 'https://second.example/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountLinksView();
    await settle(wrapper);
    await wrapper.get('[data-testid="start-link-sort"]').trigger('click');
    const sortable = wrapper.findComponent(SortableList);
    expect(sortable.attributes('item-ids')).toBeUndefined();

    sortable.vm.$emit('reorder', [11, 10]);
    sortable.vm.$emit('reorder', [10, 11]);
    sortable.vm.$emit('reorder', [11, 10]);
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-testid="link-row-11"]').find('.drag-handle').exists()).toBe(true);
    expect(wrapper.get('[data-testid="link-search"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="save-link-sort"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids: [11, 10] }),
    });
  });

  it('ignores repeated bookmark save clicks while a reorder request is pending', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    const pendingSave = new Promise((resolve) => {
      resolveSave = resolve;
    });
    apiRequest
      .mockResolvedValueOnce([{ id: 1, userId: 1, name: 'Tools', sortOrder: 100 }])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'First', url: 'https://first.example/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'Second', url: 'https://second.example/', sortOrder: 90 },
      ])
      .mockReturnValueOnce(pendingSave);

    const wrapper = mountLinksView();
    await settle(wrapper);
    await wrapper.get('[data-testid="start-link-sort"]').trigger('click');

    const saveButton = wrapper.get('[data-testid="save-link-sort"]').element;
    saveButton.dispatchEvent(new MouseEvent('click'));
    saveButton.dispatchEvent(new MouseEvent('click'));
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledTimes(3);

    resolveSave({ ok: true });
    await settle(wrapper);
  });

  it('keeps the bookmark draft order available after a save failure', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 1, userId: 1, name: 'Tools', sortOrder: 100 }])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'First', url: 'https://first.example/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'Second', url: 'https://second.example/', sortOrder: 90 },
      ])
      .mockRejectedValueOnce(new Error('network unavailable'));

    const wrapper = mountLinksView();
    await settle(wrapper);
    await wrapper.get('[data-testid="start-link-sort"]').trigger('click');
    wrapper.findComponent(SortableList).vm.$emit('reorder', [11, 10]);
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-testid="save-link-sort"]').trigger('click');
    await settle(wrapper);

    const rows = wrapper.findAll('[data-testid^="link-row-"]');
    expect(rows.map((row) => row.attributes('data-testid'))).toEqual(['link-row-11', 'link-row-10']);
    expect(wrapper.get('[data-testid="save-link-sort"]').attributes('disabled')).toBeUndefined();
  });
});
