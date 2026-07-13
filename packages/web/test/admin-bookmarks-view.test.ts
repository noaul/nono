import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookmarksView from '../src/views/admin/BookmarksView.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

function mountBookmarksView() {
  return mount(BookmarksView, {
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
      },
    },
  });
}

async function settle(wrapper: ReturnType<typeof mountBookmarksView>) {
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
}

describe('BookmarksView import workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('previews bookmark imports before confirming the import', async () => {
    apiRequest
      .mockResolvedValueOnce({
        summary: {
          parsedFolders: 1,
          parsedLinks: 3,
          newFolders: 1,
          newLinks: 1,
          duplicateLinks: 1,
          invalidLinks: 1,
          ignoredFolders: 0,
          ignoredLinks: 0,
        },
        folders: [{ tempId: 'folder-1', parentTempId: null, name: 'Dev', status: 'new' }],
        links: [
          { tempId: 'link-1', name: 'Example', url: 'https://example.com/', folderTempId: 'folder-1', status: 'new' },
          { tempId: 'link-2', name: 'GitHub', url: 'https://github.com/', folderTempId: 'folder-1', status: 'duplicate', reason: 'URL already exists' },
          { tempId: 'link-3', name: 'Chrome', url: 'chrome://bookmarks/', folderTempId: 'folder-1', status: 'invalid', reason: 'URL must start with http:// or https://' },
        ],
      })
      .mockResolvedValueOnce({ addedFolders: 1, addedLinks: 1, skippedDuplicates: 1, skippedInvalid: 1 });

    const wrapper = mountBookmarksView();
    await wrapper.get('textarea').setValue('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    await wrapper.get('[data-testid="preview-bookmarks"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/bookmarks/preview', expect.objectContaining({ method: 'POST' }));
    expect(wrapper.text()).toContain('预览结果');
    expect(wrapper.text()).toContain('新增链接 1');
    expect(wrapper.text()).toContain('重复链接 1');
    expect(wrapper.text()).toContain('不可导入 1');
    expect(wrapper.text()).toContain('GitHub');

    await wrapper.get('[data-testid="confirm-import"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/bookmarks/import', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        html: '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
        selection: {
          folderTempIds: ['folder-1'],
          linkTempIds: ['link-1'],
        },
      }),
    }));
    expect(wrapper.text()).toContain('导入 1 个文件夹、1 个链接');
  });

  it('lets users exclude folders and individual bookmarks from import', async () => {
    apiRequest
      .mockResolvedValueOnce({
        summary: {
          parsedFolders: 2,
          parsedLinks: 2,
          newFolders: 2,
          newLinks: 2,
          duplicateLinks: 0,
          invalidLinks: 0,
          ignoredFolders: 1,
          ignoredLinks: 1,
        },
        folders: [
          { tempId: 'folder-1', parentTempId: null, name: 'Work', status: 'new' },
          { tempId: 'folder-2', parentTempId: null, name: 'Life', status: 'new' },
        ],
        links: [
          { tempId: 'link-1', name: 'GitHub', url: 'https://github.com/', folderTempId: 'folder-1', status: 'new' },
          { tempId: 'link-2', name: 'Recipes', url: 'https://recipes.example/', folderTempId: 'folder-2', status: 'new' },
        ],
      })
      .mockResolvedValueOnce({ addedFolders: 1, addedLinks: 1, skippedDuplicates: 0, skippedInvalid: 0 });

    const wrapper = mountBookmarksView();
    await wrapper.get('textarea').setValue('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    await wrapper.get('[data-testid="preview-bookmarks"]').trigger('click');
    await settle(wrapper);

    expect(wrapper.text()).toContain('已忽略 Bookmarks 外 1 个文件夹、1 个链接');
    await wrapper.get('[data-testid="select-import-folder-folder-2"]').setValue(false);
    await wrapper.get('[data-testid="confirm-import"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/bookmarks/import', expect.objectContaining({
      body: JSON.stringify({
        html: '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
        selection: {
          folderTempIds: ['folder-1'],
          linkTempIds: ['link-1'],
        },
      }),
    }));
  });
});
