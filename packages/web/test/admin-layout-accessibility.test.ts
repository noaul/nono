import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from '../src/components/AdminLayout.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

describe('AdminLayout mobile navigation accessibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ items: [], unreadCount: 0, generatedAt: '' });
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('behaves as a modal drawer and restores focus when closed', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    const page = { template: '<div />' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: page },
        { path: '/admin', component: page },
        { path: '/admin/:page', component: page },
      ],
    });
    await router.push('/admin');
    await router.isReady();
    const wrapper = mount(AdminLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    const toggle = wrapper.get<HTMLButtonElement>('.mobile-nav-toggle');
    toggle.element.focus();
    await toggle.trigger('click');
    await flushPromises();

    const sidebar = wrapper.get<HTMLElement>('.workbench-sidebar');
    expect(sidebar.attributes('role')).toBe('dialog');
    expect(sidebar.attributes('aria-modal')).toBe('true');
    expect(sidebar.element.contains(document.activeElement)).toBe(true);
    expect(wrapper.get('.workbench-main').attributes()).toHaveProperty('inert');
    expect(document.body.style.overflow).toBe('hidden');

    const focusable = sidebar.findAll<HTMLElement>('a, button');
    focusable.at(-1)!.element.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(sidebar.element.contains(document.activeElement)).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await flushPromises();
    expect(sidebar.attributes('role')).toBeUndefined();
    expect(wrapper.get('.workbench-main').attributes()).not.toHaveProperty('inert');
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(toggle.element);
    wrapper.unmount();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('releases the drawer lock when the viewport crosses into desktop', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    const page = { template: '<div />' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: page },
        { path: '/admin', component: page },
        { path: '/admin/:page', component: page },
      ],
    });
    await router.push('/admin');
    await router.isReady();
    const wrapper = mount(AdminLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    await wrapper.get('.mobile-nav-toggle').trigger('click');
    await flushPromises();
    expect(document.body.style.overflow).toBe('hidden');

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    window.dispatchEvent(new Event('resize'));
    await flushPromises();

    expect(wrapper.get('.workbench-sidebar').attributes('role')).toBeUndefined();
    expect(wrapper.get('.workbench-main').attributes()).not.toHaveProperty('inert');
    expect(document.body.style.overflow).toBe('');
    wrapper.unmount();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });
});
