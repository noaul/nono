import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsView from '../src/views/admin/NotificationsView.vue';
import { apiRequest } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);
const feed = {
  generatedAt: '2026-07-18T08:00:00.000Z',
  unreadCount: 2,
  items: [
    {
      key: 'links:abc',
      source: 'links',
      severity: 'critical',
      title: 'NoNo 访问异常',
      description: 'HTTP 503',
      href: '/admin/links',
      occurredAt: '2026-07-18T07:00:00.000Z',
      dueAt: null,
      read: false,
    },
    {
      key: 'nodesk:def',
      source: 'nodesk',
      severity: 'info',
      title: '发布周报',
      description: '2026-07-20 · 18:00',
      href: '/nodesk',
      occurredAt: '2026-07-20T18:00:00',
      dueAt: '2026-07-20T18:00:00',
      read: false,
    },
  ],
};

describe('NotificationsView', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue(structuredClone(feed) as any);
  });

  it('shows the unified feed and filters unread items', async () => {
    const wrapper = mount(NotificationsView);
    await flushPromises();

    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/notifications?limit=100');
    expect(wrapper.findAll('.notification-row')).toHaveLength(2);
    expect(wrapper.text()).toContain('NoNo 访问异常');
    expect(wrapper.text()).toContain('发布周报');
    expect(wrapper.get('[data-testid="notification-filter-unread"]').attributes('aria-pressed')).toBe('false');

    await wrapper.get('[data-testid="notification-filter-unread"]').trigger('click');
    expect(wrapper.findAll('.notification-row')).toHaveLength(2);
  });

  it('marks all current notifications as read without reloading the page', async () => {
    mockedApiRequest
      .mockResolvedValueOnce(structuredClone(feed) as any)
      .mockResolvedValueOnce({ updated: 2 } as any);
    const wrapper = mount(NotificationsView);
    await flushPromises();

    await wrapper.get('[data-testid="mark-all-notifications-read"]').trigger('click');
    await flushPromises();

    expect(mockedApiRequest).toHaveBeenLastCalledWith('/api/admin/notifications/mark-all-read', { method: 'POST' });
    expect(wrapper.get('[data-testid="notification-unread-count"]').text()).toBe('0');
    expect(wrapper.findAll('.notification-row.is-unread')).toHaveLength(0);
  });

  it('dismisses one notification from the feed', async () => {
    mockedApiRequest
      .mockResolvedValueOnce(structuredClone(feed) as any)
      .mockResolvedValueOnce({ ok: true } as any);
    const wrapper = mount(NotificationsView);
    await flushPromises();

    await wrapper.get('[data-testid="dismiss-notification-links:abc"]').trigger('click');
    await flushPromises();

    expect(mockedApiRequest).toHaveBeenLastCalledWith('/api/admin/notifications/links%3Aabc', { method: 'DELETE' });
    expect(wrapper.findAll('.notification-row')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('NoNo 访问异常');
  });
});
