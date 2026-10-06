import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));
vi.mock('@/composables/useToasts', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  settings: { enabled: false, cadence: 'daily', hour: 4, weekday: 1, keep: 14 },
  status: { webDavConfigured: true, lastRunAt: null, lastSuccessAt: null, lastError: null, lastFile: null, files: [] },
  ...overrides,
});

describe('BookmarkExportSchedule', () => {
  beforeEach(() => apiRequest.mockReset());

  it('saves a weekly schedule', async () => {
    apiRequest.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot({ settings: { enabled: true, cadence: 'weekly', hour: 4, weekday: 1, keep: 14 } }));
    const { default: Schedule } = await import('../src/components/admin/BookmarkExportSchedule.vue');
    const wrapper = mount(Schedule);
    await flushPromises();

    await wrapper.get('[data-testid="bookmark-export-enabled"]').setValue(true);
    await wrapper.get('[data-testid="bookmark-export-cadence"]').setValue('weekly');
    await wrapper.get('[data-testid="save-bookmark-export"]').trigger('click');
    await flushPromises();

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/bookmark-export', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true, cadence: 'weekly', hour: 4, weekday: 1, keep: 14 }),
    });
  });

  it('explains that WebDAV is missing and disables export now', async () => {
    apiRequest.mockResolvedValueOnce(snapshot({ status: { webDavConfigured: false, lastRunAt: null, lastSuccessAt: null, lastError: null, lastFile: null, files: [] } }));
    const { default: Schedule } = await import('../src/components/admin/BookmarkExportSchedule.vue');
    const wrapper = mount(Schedule);
    await flushPromises();

    expect(wrapper.find('[data-testid="webdav-missing"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="run-bookmark-export"]').attributes('disabled')).toBeDefined();
  });
});
