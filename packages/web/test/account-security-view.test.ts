import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountView from '../src/views/admin/AccountView.vue';

const apiRequest = vi.fn();
const startRegistration = vi.fn();
const writeText = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: (...args: unknown[]) => startRegistration(...args),
}));

const security = {
  passkeys: [{
    id: 'credential-1',
    name: 'Windows Hello',
    deviceType: 'multiDevice',
    backedUp: true,
    lastUsedAt: null,
    createdAt: '2026-07-18T01:00:00.000Z',
  }],
  sessions: [{
    id: 'session-1',
    current: true,
    userAgent: 'Chrome on Windows',
    ipAddress: '203.0.113.8',
    lastSeenAt: '2026-07-18T02:00:00.000Z',
    expiresAt: '2026-08-01T02:00:00.000Z',
    createdAt: '2026-07-18T01:30:00.000Z',
  }],
};

function installDefaultApiMock() {
  apiRequest.mockImplementation(async (url: string, options?: { method?: string }) => {
    if (url === '/api/admin/account/security') return security;
    if (url === '/api/admin/site' && !options?.method) return { guestAccessEnabled: false, guestAccessPasswordSet: false };
    if (url === '/api/admin/tokens' && !options?.method) return [];
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function settle() {
  await flushPromises();
}

describe('AccountView security controls', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    startRegistration.mockReset();
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    installDefaultApiMock();
  });

  it('shows passkeys and keeps login devices at the bottom of the account page', async () => {
    const wrapper = mount(AccountView);
    await settle();

    expect(wrapper.text()).toContain('Windows Hello');
    expect(wrapper.text()).toContain('Chrome on Windows');
    expect(wrapper.text()).toContain('当前设备');
    const sections = wrapper.findAll('.admin-section');
    expect(sections.at(-1)?.attributes('data-testid')).toBe('login-devices-section');
    expect(wrapper.get('[data-testid="api-token-section"]').element.compareDocumentPosition(
      wrapper.get('[data-testid="login-devices-section"]').element,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('registers a passkey with the browser and adds it to the list', async () => {
    apiRequest.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/api/admin/account/security') return { passkeys: [], sessions: [] };
      if (url === '/api/admin/site' && !options?.method) return { guestAccessEnabled: false, guestAccessPasswordSet: false };
      if (url === '/api/admin/tokens' && !options?.method) return [];
      if (url === '/api/admin/account/passkeys/options') return { options: { challenge: 'register-challenge' }, challengeId: 'challenge-1' };
      if (url === '/api/admin/account/passkeys') return { ...security.passkeys[0], name: 'My phone' };
      throw new Error(`Unexpected request: ${url}`);
    });
    startRegistration.mockResolvedValue({ id: 'credential-1', response: {} });
    const wrapper = mount(AccountView);
    await settle();

    await wrapper.get('[data-testid="passkey-name"]').setValue('My phone');
    await wrapper.get('[data-testid="add-passkey"]').trigger('click');
    await settle();

    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'register-challenge' } });
    expect(apiRequest).toHaveBeenCalledWith('/api/admin/account/passkeys', {
      method: 'POST',
      body: JSON.stringify({ challengeId: 'challenge-1', name: 'My phone', response: { id: 'credential-1', response: {} } }),
    });
    expect(wrapper.text()).toContain('My phone');
  });

  it('configures the guest homepage password beside the login password', async () => {
    apiRequest.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/api/admin/account/security') return { passkeys: [], sessions: [] };
      if (url === '/api/admin/tokens') return [];
      if (url === '/api/admin/site' && options?.method === 'PUT') return { guestAccessEnabled: true, guestAccessPasswordSet: true };
      if (url === '/api/admin/site') return { guestAccessEnabled: false, guestAccessPasswordSet: false };
      throw new Error(`Unexpected request: ${url}`);
    });
    const wrapper = mount(AccountView);
    await settle();

    await wrapper.get('[data-testid="guest-access-password"]').setValue('nono');
    await wrapper.get('[data-testid="guest-access-enabled"]').setValue(true);
    await wrapper.get('.guest-access-section').trigger('submit');
    await settle();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/site', {
      method: 'PUT',
      body: JSON.stringify({ guestAccessEnabled: true, guestAccessPassword: 'nono' }),
    });
  });

  it('creates a compact API token and opens a one-time copy dialog', async () => {
    apiRequest.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/api/admin/account/security') return { passkeys: [], sessions: [] };
      if (url === '/api/admin/site') return { guestAccessEnabled: false, guestAccessPasswordSet: false };
      if (url === '/api/admin/tokens' && options?.method === 'POST') {
        return { id: 7, name: 'Chrome', token: 'nono_once_secret', scopes: ['bookmarks:read'], expiresAt: null };
      }
      if (url === '/api/admin/tokens') return [];
      throw new Error(`Unexpected request: ${url}`);
    });
    const wrapper = mount(AccountView);
    await settle();

    expect(wrapper.find('.token-summary-grid').exists()).toBe(false);
    await wrapper.get('[data-testid="token-name"]').setValue('Chrome');
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="create-api-token"]').trigger('click');
    await settle();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/tokens', expect.objectContaining({ method: 'POST' }));
    expect(wrapper.get('[data-testid="created-api-token-modal"]').text()).toContain('nono_once_secret');
    await wrapper.get('[data-testid="copy-created-api-token"]').trigger('click');
    await settle();
    expect(writeText).toHaveBeenCalledWith('nono_once_secret');
  });
});
