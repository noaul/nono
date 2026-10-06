import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImportView from '../src/views/admin/ImportView.vue';
import { useAuthStore } from '../src/stores/auth';

const apiRequest = vi.fn();
vi.mock('@/api/client', async (original) => ({
  ...(await original<typeof import('../src/api/client')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

describe('ImportView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({
      settings: { enabled: false, cadence: 'daily', hour: 4, weekday: 1, keep: 14 },
      status: { webDavConfigured: false, lastRunAt: null, lastSuccessAt: null, lastError: null, lastFile: null, files: [] },
    });
  });

  it('hosts browser bookmark import and export as a content management tab', () => {
    const wrapper = mount(ImportView);

    expect(wrapper.get('.content-management-tab.active').text()).toBe('导入导出');
    expect(wrapper.text()).toContain('书签导入导出');
    expect(wrapper.find('[data-testid="preview-bookmarks"]').exists()).toBe(true);
  });

  it('shows the WebDAV export schedule to administrators only', async () => {
    const member = mount(ImportView);
    await vi.dynamicImportSettled();
    expect(member.find('[data-testid="bookmark-export-schedule"]').exists()).toBe(false);
    expect(apiRequest).not.toHaveBeenCalledWith('/api/admin/bookmark-export');

    useAuthStore().user = { id: 1, username: 'admin', displayName: 'Admin', email: 'a@x', role: 'admin' };
    const admin = mount(ImportView);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await admin.vm.$nextTick();
    expect(admin.find('[data-testid="bookmark-export-schedule"]').exists()).toBe(true);
  });
});
