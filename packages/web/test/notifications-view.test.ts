import { mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsView from '../src/views/admin/NotificationsView.vue';

const apiRequest = vi.fn();
const confirm = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm }),
}));

function bookmarkNotification() {
  return {
    key: 'links:abc123',
    source: 'links',
    severity: 'critical',
    title: 'Broken 访问异常',
    description: 'HTTP 404',
    href: '/admin/links',
    targetUrl: 'https://broken.example/',
    entityId: 31,
    occurredAt: '2026-07-18T08:00:00.000Z',
    dueAt: null,
    read: false,
  } as const;
}

async function mountView(items = [bookmarkNotification()]) {
  apiRequest.mockResolvedValueOnce({ items, unreadCount: items.length, urgentUnreadCount: items.length, generatedAt: '2026-07-18T08:00:00.000Z' });
  const wrapper = mount(NotificationsView, { global: { stubs: { RouterLink: RouterLinkStub, AdminPageHeader: { template: '<header><slot name="actions" /></header>' } } } });
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe('NotificationsView bookmark actions', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    confirm.mockReset();
    confirm.mockResolvedValue(true);
  });

  it('shows source filters and distinct source tone classes', async () => {
    const wrapper = await mountView([
      bookmarkNotification(),
      { ...bookmarkNotification(), key: 'nodesk:abc', source: 'nodesk', title: 'Schedule' },
    ] as any);

    expect(wrapper.find('[data-testid="notification-source-links"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="notification-source-nodesk"]').exists()).toBe(true);
    expect(wrapper.find('.notification-row.source-links').exists()).toBe(true);
    expect(wrapper.find('.notification-row.source-nodesk').exists()).toBe(true);
  });

  it('opens the broken bookmark from its quick action', async () => {
    const wrapper = await mountView();
    const action = wrapper.get('[data-testid="open-bookmark-31"]');
    expect(action.attributes('href')).toBe('https://broken.example/');
    expect(action.attributes('target')).toBe('_blank');
  });

  it('disables future checks and removes the notification', async () => {
    const wrapper = await mountView();
    apiRequest.mockResolvedValueOnce({ healthCheckEnabled: false });

    await wrapper.get('[data-testid="disable-bookmark-health-31"]').trigger('click');
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/admin/links/31', expect.objectContaining({ method: 'PUT' })));
    expect(apiRequest.mock.calls.at(-1)?.[1]?.body).toBe(JSON.stringify({ healthCheckEnabled: false }));
    expect(wrapper.text()).not.toContain('Broken 访问异常');
  });

  it('confirms quick deletion and moves the bookmark to trash', async () => {
    const wrapper = await mountView();
    apiRequest.mockResolvedValueOnce({ ok: true });

    await wrapper.get('[data-testid="delete-bookmark-31"]').trigger('click');
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/admin/links/31', { method: 'DELETE' }));
    expect(confirm).toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Broken 访问异常');
  });
});
