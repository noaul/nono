import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsView from '../src/views/admin/NotificationsView.vue';
import { apiRequest } from '../src/api/client';
import { clearToasts } from '../src/composables/useToasts';

vi.mock('../src/api/client', () => ({
  apiRequest: vi.fn(),
  jsonBody: (value: unknown) => JSON.stringify(value),
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
    clearToasts();
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

  it('shows NoMoney domain reminders as plain links without the retired VPS renewal action', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      generatedAt: '2026-07-18T08:00:00.000Z',
      unreadCount: 1,
      items: [{
        key: 'nomoney:domain',
        source: 'nomoney',
        severity: 'warning',
        title: '域名 example.com 3 天后到期',
        description: '到期日 2026-07-21',
        href: '/nomoney/domains?edit=10',
        occurredAt: '2026-07-21T23:59:00',
        dueAt: '2026-07-21T23:59:00',
        entityId: 10,
        entityType: 'domain',
        entityLabel: 'example.com',
        renewalDate: '2026-07-21',
        read: false,
      }],
    } as any);
    const wrapper = mount(NotificationsView, { global: { stubs: { RouterLink: true } } });
    await flushPromises();

    expect(wrapper.get('.notification-copy a').attributes('href')).toBe('/nomoney/domains?edit=10');
    expect(wrapper.find('[data-testid="mark-vps-renewed-10"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="notification-source-yumi"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
