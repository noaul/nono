import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsView from '../src/views/admin/NotificationsView.vue';
import ToastHost from '../src/components/admin/ToastHost.vue';
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

  it('marks a NoMoney VPS as renewed directly from its notification', async () => {
    const vpsFeed = {
      generatedAt: '2026-07-18T08:00:00.000Z',
      unreadCount: 1,
      items: [{
        key: 'nomoney:vps',
        source: 'nomoney',
        severity: 'warning',
        title: 'VPS nc48 即将到期',
        description: '到期日 2026-08-10',
        href: '/nomoney/vps',
        occurredAt: '2026-08-10T23:59:00',
        dueAt: '2026-08-10T23:59:00',
        entityId: 10,
        entityType: 'vps',
        entityLabel: 'nc48',
        renewalDate: '2026-08-10',
        read: false,
      }],
    };
    mockedApiRequest
      .mockResolvedValueOnce(structuredClone(vpsFeed) as any)
      .mockResolvedValueOnce({
        idempotent: false,
        item: { id: 10, expireDate: '2027-08-10' },
        renewal: { id: 41, renewedExpireDate: '2027-08-10', amountMinorUnits: 1200, currency: 'USD' },
      } as any);
    const wrapper = mount(NotificationsView);
    await flushPromises();

    await wrapper.get('[data-testid="mark-vps-renewed-10"]').trigger('click');
    await flushPromises();

    expect(mockedApiRequest).toHaveBeenLastCalledWith('/api/admin/nomoney/vps/10/renew', expect.objectContaining({
      method: 'POST',
    }));
    expect(wrapper.findAll('.notification-row')).toHaveLength(0);

    const toastHost = mount(ToastHost);
    expect(toastHost.text()).toContain('撤销');
    expect(toastHost.text()).toContain('修改金额');

    await toastHost.findAll('.toast-action').find((button) => button.text() === '修改金额')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="renewal-amount-editor"]').exists()).toBe(true);
  });
});
