import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@/composables/useToasts', () => ({
  useToasts: () => ({ push: vi.fn() }),
}));

const article = {
  id: 7,
  folderId: 2,
  name: 'Long read',
  url: 'https://essay.example/long',
  sortOrder: 0,
  readLaterAt: '2026-10-05T03:00:00.000Z',
  readAt: null,
  folderPath: ['Reading', 'Essays'],
};

describe('ReadingView', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('lists unread links and marks one read', async () => {
    apiRequest
      .mockResolvedValueOnce({ items: [article], total: 1, unread: 1 })
      .mockResolvedValueOnce({ ...article, readAt: '2026-10-06T03:00:00.000Z' });
    const { default: ReadingView } = await import('../src/views/admin/ReadingView.vue');
    const wrapper = mount(ReadingView);
    await flushPromises();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/reading?status=unread&limit=50&offset=0');
    const row = wrapper.get('[data-testid="reading-item-7"]');
    expect(row.text()).toContain('Long read');
    expect(row.text()).toContain('essay.example · Reading / Essays');

    await wrapper.get('[data-testid="reading-mark-read-7"]').trigger('click');
    await flushPromises();

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/7', { method: 'PUT', body: JSON.stringify({ read: true }) });
    expect(wrapper.find('[data-testid="reading-item-7"]').exists()).toBe(false);
  });

  it('switches to the read list', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, unread: 0 });
    const { default: ReadingView } = await import('../src/views/admin/ReadingView.vue');
    const wrapper = mount(ReadingView);
    await flushPromises();

    await wrapper.get('[data-testid="reading-read"]').trigger('click');
    await flushPromises();

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/reading?status=read&limit=50&offset=0');
    expect(wrapper.text()).toContain('还没有读完的链接');
  });
});
