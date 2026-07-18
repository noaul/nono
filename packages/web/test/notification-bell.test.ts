import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationBell from '../src/components/admin/NotificationBell.vue';
import { apiRequest } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe('NotificationBell', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue({
      generatedAt: '2026-07-18T08:00:00.000Z',
      unreadCount: 1,
      items: [{
        key: 'nostar:abc',
        source: 'nostar',
        severity: 'info',
        title: 'owner/tool 发布 v2',
        description: 'Stable',
        href: '/nostar/',
        occurredAt: '2026-07-18T07:00:00.000Z',
        dueAt: null,
        read: false,
      }],
    } as any);
  });

  it('loads a compact preview and links to the full center', async () => {
    const wrapper = mount(NotificationBell, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    await flushPromises();

    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/notifications?limit=5');
    expect(wrapper.find('[aria-label="通知"]').exists()).toBe(true);
    expect(wrapper.get('.notification-badge').text()).toBe('1');

    await wrapper.get('[aria-label="通知"]').trigger('click');
    expect(wrapper.get('.notification-popover').text()).toContain('owner/tool 发布 v2');
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/admin/notifications');
  });
});
