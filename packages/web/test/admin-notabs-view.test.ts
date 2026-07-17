import fs from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SortableList from '../src/components/admin/SortableList.vue';
import NotabsView from '../src/views/admin/NotabsView.vue';

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

function mountNotabsView() {
  return mount(NotabsView, {
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
      },
    },
  });
}

async function settle(wrapper: ReturnType<typeof mountNotabsView>) {
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
}

describe('NotabsView admin workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    confirm.mockReset();
    confirm.mockResolvedValue(true);
  });

  it('uses one column per Notab card on narrow screens', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/NotabsView.vue'), 'utf8');
    expect(source).toContain('@media (max-width: 720px)');
    expect(source).toContain('grid-template-columns: 1fr !important');
  });

  it('shows only top-level Notabs with folder and bookmark impact counts', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: '开发', parentId: 1, sortOrder: 90 },
        { id: 3, userId: 1, name: '文档', parentId: 2, sortOrder: 80 },
        { id: 4, userId: 1, name: '生活', parentId: null, sortOrder: 70 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 2, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
        { id: 11, folderId: 3, name: 'MDN', url: 'https://developer.mozilla.org/', sortOrder: 90 },
      ]);

    const wrapper = mountNotabsView();
    await settle(wrapper);

    expect(wrapper.find('[data-testid="notab-row-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="notab-row-2"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="notab-row-4"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="notab-row-1"]').text()).toContain('2 个文件夹');
    expect(wrapper.get('[data-testid="notab-row-1"]').text()).toContain('2 个书签');
  });

  it('creates a Notab from the add row at the end of the list', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ settings: {} })
      .mockResolvedValueOnce({ id: 2, userId: 1, name: '生活', icon: 'sparkles', parentId: null, sortOrder: -10 });

    const wrapper = mountNotabsView();
    await settle(wrapper);

    expect(wrapper.text()).not.toContain('请先在文件夹页面创建');
    await wrapper.get('[data-testid="add-notab-row"]').trigger('click');
    await wrapper.get('[data-testid="new-notab-name"]').setValue('生活');
    await wrapper.get('[data-testid="save-new-notab"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders', {
      method: 'POST',
      body: JSON.stringify({ parentId: null, name: '生活', icon: '', description: '' }),
    });
    expect(wrapper.get('[data-testid="notab-row-2"]').text()).toContain('生活');
  });

  it('shows Nodesk and NoMoney entry management above the Notab list and saves custom entries', async () => {
    apiRequest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        name: 'Nono',
        description: '',
        slug: 'admin',
        backgroundColor: '#000000',
        fontColor: '#ffffff',
        searchUrlTemplate: 'https://google.com/search?q={query}',
        localSearchFirst: true,
        settings: {
          portal: { enabled: true, label: 'Nodesk', url: '/nodesk', imageUrl: '', openInNewTab: false },
          navigationEntries: [{ id: 'nomoney', label: 'NoMoney', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false }],
        },
      })
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountNotabsView();
    await settle(wrapper);

    const entrySection = wrapper.get('[data-testid="entry-management"]');
    expect(entrySection.text()).toContain('Nodesk');
    expect((entrySection.findAll('input')[3].element as HTMLInputElement).value).toBe('NoMoney');
    expect(entrySection.element.compareDocumentPosition(wrapper.get('[data-testid="notab-management"]').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await wrapper.get('[data-testid="add-navigation-entry"]').trigger('click');
    await wrapper.get('[data-testid="new-entry-label"]').setValue('Status');
    await wrapper.get('[data-testid="new-entry-url"]').setValue('/status');
    await wrapper.get('[data-testid="save-navigation-entries"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/site', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('"label":"Status"'),
    }));
  });

  it('uses the same column layout for fixed and custom navigation entries', async () => {
    apiRequest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        settings: {
          portal: { enabled: true, label: 'Nodesk', url: '/nodesk', imageUrl: '', openInNewTab: false },
          navigationEntries: [{ id: 'nomoney', label: 'NoMoney', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false }],
        },
      });

    const wrapper = mountNotabsView();
    await settle(wrapper);

    const rows = wrapper.findAll('.entry-editor-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].classes()).toEqual(rows[1].classes());
  });

  it('renames a Notab inline and saves explicitly', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ settings: {} })
      .mockResolvedValueOnce({ id: 1, userId: 1, name: '研究', parentId: null, sortOrder: 100 });

    const wrapper = mountNotabsView();
    await settle(wrapper);
    await wrapper.get('[data-testid="edit-notab-1"]').trigger('click');
    await wrapper.get('[data-testid="notab-name-1"]').setValue('研究');
    await wrapper.get('[data-testid="save-notab-1"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/1', {
      method: 'PUT',
      body: JSON.stringify({ name: '研究' }),
    });
    expect(wrapper.get('[data-testid="notab-row-1"]').text()).toContain('研究');
    expect(wrapper.find('[data-testid="notab-name-1"]').exists()).toBe(false);
  });

  it('keeps drag ordering local until the user saves top-level ids', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: '开发', parentId: 1, sortOrder: 90 },
        { id: 3, userId: 1, name: '生活', parentId: null, sortOrder: 80 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ settings: {} })
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountNotabsView();
    await settle(wrapper);
    await wrapper.get('[data-testid="start-notab-sort"]').trigger('click');
    wrapper.findComponent(SortableList).vm.$emit('reorder', [3, 1]);
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(wrapper.find('[data-testid="notab-row-2"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="notab-row-3"]').find('.drag-handle').exists()).toBe(true);

    await wrapper.get('[data-testid="save-notab-sort"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids: [3, 1] }),
    });
  });

  it('confirms recursive impact before deleting a Notab', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工作', parentId: null, sortOrder: 100 },
        { id: 2, userId: 1, name: '开发', parentId: 1, sortOrder: 90 },
        { id: 3, userId: 1, name: '文档', parentId: 2, sortOrder: 80 },
        { id: 4, userId: 1, name: '生活', parentId: null, sortOrder: 70 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: '首页', url: 'https://example.com/', sortOrder: 100 },
        { id: 11, folderId: 2, name: 'GitHub', url: 'https://github.com/', sortOrder: 90 },
        { id: 12, folderId: 3, name: 'MDN', url: 'https://developer.mozilla.org/', sortOrder: 80 },
      ])
      .mockResolvedValueOnce({ settings: {} })
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountNotabsView();
    await settle(wrapper);
    await wrapper.get('[data-testid="delete-notab-1"]').trigger('click');
    await settle(wrapper);

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '删除 Notab',
      message: expect.stringContaining('2 个文件夹和 3 个书签'),
    }));
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/1', { method: 'DELETE' });
    expect(wrapper.find('[data-testid="notab-row-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="notab-row-4"]').exists()).toBe(true);
  });
});
