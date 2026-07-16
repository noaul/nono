import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AdminStateBanner from '../src/components/admin/AdminStateBanner.vue';

describe('AdminStateBanner', () => {
  it.each([
    ['success', 'status'],
    ['info', 'status'],
    ['warning', 'status'],
    ['error', 'alert'],
  ] as const)('renders the %s tone with the correct live-region role', (tone, role) => {
    const wrapper = mount(AdminStateBanner, {
      props: { tone, message: `${tone} message` },
    });

    expect(wrapper.attributes('role')).toBe(role);
    expect(wrapper.attributes('aria-live')).toBe(role === 'alert' ? 'assertive' : 'polite');
    expect(wrapper.classes()).toContain(`admin-state-banner--${tone}`);
    expect(wrapper.text()).toContain(`${tone} message`);
    expect(wrapper.find('svg').exists()).toBe(true);
  });
});
