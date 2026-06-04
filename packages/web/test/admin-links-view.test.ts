import { mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function mountLinksView() {
  return mount(LinksView, {
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

  it('selects links and bulk moves them to another folder', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: 'Inbox', sortOrder: 100 },
        { id: 2, userId: 1, name: 'Archive', sortOrder: 90 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'One', url: 'https://one.example/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'Two', url: 'https://two.example/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({ moved: 2 });

    const wrapper = mountLinksView();
    await settle(wrapper);
    await wrapper.get('[data-testid="select-link-10"]').setValue(true);
    await wrapper.get('[data-testid="select-link-11"]').setValue(true);
    await wrapper.get('[data-testid="bulk-folder"]').setValue('2');
    await wrapper.get('[data-testid="bulk-move"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/bulk-move', expect.objectContaining({ method: 'POST' }));
    expect(wrapper.text()).toContain('Archive');
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
});
