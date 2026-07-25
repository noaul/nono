import fs from 'node:fs';
import path from 'node:path';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeNotificationBell from '../src/components/HomeNotificationBell.vue';
import HomeUrgentNoticeBar from '../src/components/HomeUrgentNoticeBar.vue';
import { useHomeNotifications } from '../src/composables/useHomeNotifications';
import { apiRequest } from '../src/api/client';
import type { AdminNotification } from '../src/api/types';

vi.mock('../src/api/client', () => ({
  apiRequest: vi.fn(),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

const mockedApiRequest = vi.mocked(apiRequest);

function notification(overrides: Partial<AdminNotification> = {}): AdminNotification {
  return {
    key: 'nodesk:today',
    source: 'nodesk',
    severity: 'warning',
    title: '今天 14:00 项目会议',
    description: '2026-07-24 · 14:00',
    href: '/nodesk',
    occurredAt: '2026-07-24T14:00:00',
    dueAt: '2026-07-24T14:00:00',
    read: false,
    ...overrides,
  };
}

const HomeNotificationsHarness = defineComponent({
  setup() {
    const enabled = ref(false);
    return { enabled, ...useHomeNotifications(enabled) };
  },
  template: `
    <div>
      <span v-for="item in items" :key="item.key" class="home-item">{{ item.title }}</span>
      <span v-for="item in urgentItems" :key="item.key" class="urgent-item">{{ item.title }}</span>
      <span data-testid="urgent-overflow">{{ urgentOverflow }}</span>
    </div>
  `,
});

describe('home notifications', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it('does not load private notifications until the homepage owner is authenticated', async () => {
    mockedApiRequest.mockResolvedValue({
      generatedAt: '2026-07-24T08:00:00.000Z',
      unreadCount: 8,
      urgentUnreadCount: 6,
      items: [
        notification(),
        notification({ key: 'nomoney:overdue', source: 'nomoney', severity: 'critical', title: 'VPS 已逾期' }),
        notification({ key: 'nomoney:soon', source: 'nomoney', title: '域名 3 天后到期' }),
        notification({ key: 'nomoney:later', source: 'nomoney', severity: 'info', title: '订阅 20 天后到期' }),
        notification({ key: 'links:broken', source: 'links', severity: 'critical', title: '书签异常' }),
      ],
    } as any);

    const wrapper = mount(HomeNotificationsHarness);
    await flushPromises();
    expect(mockedApiRequest).not.toHaveBeenCalled();

    wrapper.vm.enabled = true;
    await nextTick();
    await flushPromises();

    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/notifications?limit=100&sources=nodesk%2Cnomoney');
    expect(wrapper.findAll('.home-item')).toHaveLength(4);
    expect(wrapper.vm.unreadCount).toBe(8);
    expect(wrapper.findAll('.urgent-item').map((item) => item.text())).toEqual([
      '今天 14:00 项目会议',
      'VPS 已逾期',
    ]);
    expect(wrapper.get('[data-testid="urgent-overflow"]').text()).toBe('4');

    wrapper.vm.enabled = false;
    await nextTick();
    window.dispatchEvent(new Event('focus'));
    expect(wrapper.findAll('.home-item')).toHaveLength(0);
    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
  });

  it('renders the urgent strip with the overflow count and marks an item read when opened', async () => {
    const items = [notification(), notification({ key: 'nomoney:overdue', source: 'nomoney', title: 'VPS 已逾期' })];
    const wrapper = mount(HomeUrgentNoticeBar, {
      props: { items, overflow: 3 },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });

    expect(wrapper.text()).toContain('还有 3 条');
    await wrapper.findComponent(RouterLinkStub).trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([items[0]]);
  });

  it('shows the homepage bell preview and exposes read, dismiss, and mark-all actions', async () => {
    const items = [notification()];
    const wrapper = mount(HomeNotificationBell, {
      props: { items, unreadCount: 1, loading: false },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });

    expect(wrapper.get('.home-notification-badge').text()).toBe('1');
    await wrapper.get('[aria-label="主页通知"]').trigger('click');
    expect(wrapper.get('[role="dialog"]').text()).toContain('今天 14:00 项目会议');

    await wrapper.get('[aria-label="标记已读"]').trigger('click');
    expect(wrapper.emitted('mark-read')?.[0]).toEqual([items[0]]);

    await wrapper.get('[aria-label="忽略通知"]').trigger('click');
    expect(wrapper.emitted('dismiss')?.[0]).toEqual([items[0]]);

    await wrapper.get('[aria-label="全部标记已读"]').trigger('click');
    expect(wrapper.emitted('mark-all-read')).toHaveLength(1);
    wrapper.unmount();
  });

  it('uses the dedicated notification surface in both homepage notification views', () => {
    const bellSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/HomeNotificationBell.vue'), 'utf8');
    const urgentSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/HomeUrgentNoticeBar.vue'), 'utf8');

    expect(bellSource).toContain('background: var(--public-notification-surface');
    expect(bellSource).toContain('color: var(--public-notification-text');
    expect(urgentSource).toContain('background: var(--public-notification-surface');
    expect(urgentSource).toContain('color: var(--public-notification-text');
  });

  it('treats the mobile drawer as a modal and restores focus when closed', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    const wrapper = mount(HomeNotificationBell, {
      attachTo: document.body,
      props: { items: [notification()], unreadCount: 1, loading: false },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });

    const trigger = wrapper.get<HTMLButtonElement>('[aria-label="主页通知"]');
    trigger.element.focus();
    await trigger.trigger('click');
    await nextTick();

    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
    expect(wrapper.get('[role="dialog"]').element.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    const markRead = wrapper.get<HTMLButtonElement>('[aria-label="标记已读"]');
    markRead.element.focus();
    await wrapper.setProps({ items: [notification({ read: true })] });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(wrapper.get('[role="dialog"]').element.contains(document.activeElement)).toBe(true);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    window.dispatchEvent(new Event('resize'));
    expect(document.body.style.overflow).toBe('');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    window.dispatchEvent(new Event('resize'));
    expect(document.body.style.overflow).toBe('hidden');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(document.activeElement).toBe(trigger.element);
    expect(document.body.style.overflow).toBe('');

    wrapper.unmount();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('persists read and dismiss actions through the notification API', async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ generatedAt: '', unreadCount: 1, items: [notification()] } as any)
      .mockResolvedValue(undefined as any);
    const wrapper = mount(HomeNotificationsHarness);
    wrapper.vm.enabled = true;
    await nextTick();
    await flushPromises();

    const item = wrapper.vm.items[0];
    await wrapper.vm.markRead(item);
    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/notifications/nodesk%3Atoday/read', {
      method: 'PUT',
      body: JSON.stringify({ read: true }),
    });

    await wrapper.vm.dismiss(item);
    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/notifications/nodesk%3Atoday', { method: 'DELETE' });
  });

  it('marks only homepage notification sources as read', async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ generatedAt: '', unreadCount: 1, items: [notification()] } as any)
      .mockResolvedValue(undefined as any);
    const wrapper = mount(HomeNotificationsHarness);
    wrapper.vm.enabled = true;
    await nextTick();
    await flushPromises();

    await wrapper.vm.markAllRead();

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/api/admin/notifications/mark-all-read?sources=nodesk%2Cnomoney',
      { method: 'POST' },
    );
    expect(wrapper.vm.unreadCount).toBe(0);
  });

  it('does not let an older refresh overwrite a completed read action', async () => {
    let resolveRefresh: ((value: unknown) => void) | undefined;
    const staleRefresh = new Promise((resolve) => { resolveRefresh = resolve; });
    const feed = { generatedAt: '', unreadCount: 1, items: [notification()] };
    mockedApiRequest
      .mockResolvedValueOnce(feed as any)
      .mockReturnValueOnce(staleRefresh as any)
      .mockResolvedValueOnce(undefined as any);
    const wrapper = mount(HomeNotificationsHarness);
    wrapper.vm.enabled = true;
    await nextTick();
    await flushPromises();

    window.dispatchEvent(new Event('focus'));
    await nextTick();
    await wrapper.vm.markRead(wrapper.vm.items[0]);
    resolveRefresh?.(feed);
    await flushPromises();

    expect(wrapper.vm.items[0].read).toBe(true);
  });

  it('isolates pending mutations when notification access is disabled and re-enabled', async () => {
    let rejectOldDismiss: ((reason?: unknown) => void) | undefined;
    const pendingDismiss = new Promise((_resolve, reject) => { rejectOldDismiss = reject; });
    const firstFeed = { generatedAt: '', unreadCount: 1, urgentUnreadCount: 1, items: [notification()] };
    const replacement = notification({ key: 'nomoney:replacement', source: 'nomoney', title: '新的续费提醒' });
    const secondFeed = { generatedAt: '', unreadCount: 1, urgentUnreadCount: 1, items: [replacement] };
    mockedApiRequest
      .mockResolvedValueOnce(firstFeed as any)
      .mockReturnValueOnce(pendingDismiss as any)
      .mockResolvedValueOnce(secondFeed as any);
    const wrapper = mount(HomeNotificationsHarness);
    wrapper.vm.enabled = true;
    await nextTick();
    await flushPromises();

    const oldDismiss = wrapper.vm.dismiss(wrapper.vm.items[0]);
    wrapper.vm.enabled = false;
    await nextTick();
    wrapper.vm.enabled = true;
    await nextTick();
    await flushPromises();

    expect(wrapper.vm.items.map((item: AdminNotification) => item.key)).toEqual(['nomoney:replacement']);

    rejectOldDismiss?.(new Error('stale request failed'));
    await oldDismiss;
    await flushPromises();

    expect(wrapper.vm.items.map((item: AdminNotification) => item.key)).toEqual(['nomoney:replacement']);
    expect(mockedApiRequest).toHaveBeenCalledTimes(3);
  });

  it('polls every five minutes while enabled and stops after unmount', async () => {
    vi.useFakeTimers();
    try {
      mockedApiRequest.mockResolvedValue({ generatedAt: '', unreadCount: 0, items: [] } as any);
      const wrapper = mount(HomeNotificationsHarness);
      wrapper.vm.enabled = true;
      await nextTick();
      await flushPromises();
      expect(mockedApiRequest).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockedApiRequest).toHaveBeenCalledTimes(2);

      wrapper.unmount();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockedApiRequest).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
