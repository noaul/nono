import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountView from '../src/views/admin/AccountView.vue';

const apiRequest = vi.fn();
const startRegistration = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: (...args: unknown[]) => startRegistration(...args),
}));

async function settle(wrapper: ReturnType<typeof mountAccountView>) {
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
}

function mountAccountView() {
  return mount(AccountView);
}

describe('AccountView security controls', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    startRegistration.mockReset();
  });

  it('shows registered passkeys and browser sessions', async () => {
    apiRequest
      .mockResolvedValueOnce({
        passkeys: [
          {
            id: 'credential-1',
            name: 'Windows Hello',
            deviceType: 'multiDevice',
            backedUp: true,
            lastUsedAt: null,
            createdAt: '2026-07-18T01:00:00.000Z',
          },
        ],
        sessions: [
          {
            id: 'session-1',
            current: true,
            userAgent: 'Chrome on Windows',
            ipAddress: '203.0.113.8',
            lastSeenAt: '2026-07-18T02:00:00.000Z',
            expiresAt: '2026-08-01T02:00:00.000Z',
            createdAt: '2026-07-18T01:30:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({ guestAccessEnabled: false, guestAccessPasswordSet: false });

    const wrapper = mountAccountView();
    await settle(wrapper);

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/account/security');
    expect(wrapper.text()).toContain('Windows Hello');
    expect(wrapper.text()).toContain('Chrome on Windows');
    expect(wrapper.text()).toContain('当前设备');
  });

  it('registers a passkey with the browser and adds it to the list', async () => {
    apiRequest
      .mockResolvedValueOnce({ passkeys: [], sessions: [] })
      .mockResolvedValueOnce({ guestAccessEnabled: false, guestAccessPasswordSet: false })
      .mockResolvedValueOnce({ options: { challenge: 'register-challenge' }, challengeId: 'challenge-1' })
      .mockResolvedValueOnce({
        id: 'credential-1',
        name: 'My phone',
        deviceType: 'multiDevice',
        backedUp: true,
        lastUsedAt: null,
        createdAt: '2026-07-18T01:00:00.000Z',
      });
    startRegistration.mockResolvedValue({ id: 'credential-1', response: {} });
    const wrapper = mountAccountView();
    await settle(wrapper);

    await wrapper.get('[data-testid="passkey-name"]').setValue('My phone');
    await wrapper.get('[data-testid="add-passkey"]').trigger('click');
    await settle(wrapper);

    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'register-challenge' } });
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/account/passkeys', {
      method: 'POST',
      body: JSON.stringify({
        challengeId: 'challenge-1',
        name: 'My phone',
        response: { id: 'credential-1', response: {} },
      }),
    });
    expect(wrapper.text()).toContain('My phone');
  });

  it('configures the guest homepage password beside the login password', async () => {
    apiRequest
      .mockResolvedValueOnce({ passkeys: [], sessions: [] })
      .mockResolvedValueOnce({ guestAccessEnabled: false, guestAccessPasswordSet: false })
      .mockResolvedValueOnce({ guestAccessEnabled: true, guestAccessPasswordSet: true });

    const wrapper = mountAccountView();
    await settle(wrapper);

    expect(wrapper.text()).toContain('开屏访问密码');
    await wrapper.get('[data-testid="guest-access-password"]').setValue('nono');
    await wrapper.get('[data-testid="guest-access-enabled"]').setValue(true);
    await wrapper.get('.guest-access-section').trigger('submit');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/site', {
      method: 'PUT',
      body: JSON.stringify({ guestAccessEnabled: true, guestAccessPassword: 'nono' }),
    });
    expect(wrapper.text()).toContain('开屏密码已开启');
  });
});
