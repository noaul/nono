import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth';
import { useConfirm, clearConfirmState } from '../src/composables/useConfirm';
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
    if (url === '/api/admin/account') return { llmProvider: 'openai', llmModel: 'saved-model', hasLlmApiKey: false };
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
    setActivePinia(createPinia());
    clearConfirmState();
    apiRequest.mockReset();
    startRegistration.mockReset();
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    installDefaultApiMock();
  });

  it('lets an administrator close registration and update a member role', async () => {
    const admin = { id: 1, username: 'admin', displayName: 'Admin', email: 'admin@example.com', role: 'admin' as const };
    useAuthStore().user = admin;
    const original = apiRequest.getMockImplementation()!;
    const member = { id: 2, username: 'member', displayName: 'Member', email: 'member@example.com', role: 'user' };
    apiRequest.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/api/admin/users') return [admin, member];
      if (url === '/api/admin/config') return options?.method ? { allowRegistration: false } : { allowRegistration: true };
      if (url === '/api/admin/users/2') return { ...member, role: 'admin' };
      return original(url, options);
    });
    const wrapper = mount(AccountView);
    await settle();
    await wrapper.get('[data-testid="allow-registration"]').setValue(false);
    await wrapper.get('[data-testid="registration-form"]').trigger('submit');
    await settle();
    expect(apiRequest).toHaveBeenCalledWith('/api/admin/config', { method: 'PUT', body: JSON.stringify({ allowRegistration: false }) });
    await wrapper.get('[data-testid="user-role-2"]').setValue('admin');
    await wrapper.get('[data-testid="user-form-2"]').trigger('submit');
    await settle();
    expect(apiRequest).toHaveBeenCalledWith('/api/admin/users/2', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ role: 'admin', displayName: 'Member', email: 'member@example.com' }) }));
  });

  it('requires confirmation to delete a member and retains them when deletion fails', async () => {
    const admin = { id: 1, username: 'admin', displayName: 'Admin', email: 'admin@example.com', role: 'admin' as const };
    useAuthStore().user = admin;
    const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/api/admin/users') return [admin, { ...admin, id: 2, username: 'member', role: 'user' }];
      if (url === '/api/admin/config') return { allowRegistration: false };
      if (url === '/api/admin/users/2' && options?.method === 'DELETE') throw new Error('Deletion unavailable');
      return original(url, options);
    });
    const wrapper = mount(AccountView);
    await settle();
    expect(wrapper.get('[data-testid="user-form-1"]').find('button.danger').exists()).toBe(false);
    const remove = wrapper.get('[data-testid="user-form-2"] button.danger');
    await remove.trigger('click');
    useConfirm().cancel();
    await settle();
    expect(apiRequest.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
    await remove.trigger('click');
    useConfirm().accept();
    await settle();
    expect(apiRequest).toHaveBeenCalledWith('/api/admin/users/2', { method: 'DELETE' });
    expect(wrapper.text()).toContain('Deletion unavailable');
    expect(wrapper.find('[data-testid="user-form-2"]').exists()).toBe(true);
  });

  it('does not expose user administration or request its data for a regular member', async () => {
    useAuthStore().user = { id: 2, username: 'member', displayName: 'Member', email: 'member@example.com', role: 'user' };
    const wrapper = mount(AccountView);
    await settle();
    expect(wrapper.find('[data-testid="registration-form"]').exists()).toBe(false);
    expect(apiRequest.mock.calls.some(([url]) => url === '/api/admin/users' || url === '/api/admin/config')).toBe(false);
  });

  it('shows when each API token was last used', async () => {
    installDefaultApiMock();
    const fallback = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/api/admin/tokens' && !options?.method) {
        return [
          { id: 1, name: 'Used', token: 'nono_a...', scopes: ['bookmarks:read'], expiresAt: null, lastUsedAt: '2026-10-01T02:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' },
          { id: 2, name: 'Idle', token: 'nono_b...', scopes: ['bookmarks:read'], expiresAt: null, lastUsedAt: null, createdAt: '2026-09-01T00:00:00.000Z' },
        ];
      }
      return fallback(url, options);
    });
    const wrapper = mount(AccountView);
    await settle();

    const labels = wrapper.findAll('[data-testid="token-last-used"]').map((item) => item.text());
    expect(labels[0]).toContain('最后使用');
    expect(labels[1]).toBe('从未使用');
  });

  it('shows passkeys and keeps login devices at the bottom of the sign-in security card', async () => {
    const wrapper = mount(AccountView);
    await settle();

    expect(wrapper.text()).toContain('Windows Hello');
    expect(wrapper.text()).toContain('Chrome on Windows');
    expect(wrapper.text()).toContain('当前设备');
    const securitySections = wrapper.get('[data-testid="account-security-card"]').findAll('.admin-section');
    expect(securitySections.at(-1)?.attributes('data-testid')).toBe('login-devices-section');
    expect(wrapper.get('[data-testid="account-access-card"]').find('[data-testid="api-token-section"]').exists()).toBe(true);
  });

  it('splits the account page into tabs and opens the access tab from older #api-tokens links', async () => {
    useAuthStore().user = { id: 1, username: 'admin', displayName: 'Admin', email: 'admin@example.com', role: 'admin' };
    const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/api/admin/users') return [];
      if (url === '/api/admin/config') return { allowRegistration: true };
      return original(url, options);
    });
    window.location.hash = '#api-tokens';
    onTestFinished(() => { window.location.hash = ''; });
    const wrapper = mount(AccountView);
    await settle();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual(['登录与安全', '访问与集成', '用户与注册']);
    expect(wrapper.get('[data-testid="admin-tab-access"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.get<HTMLElement>('[data-testid="account-access-card"]').element.style.display).toBe('');
    expect(wrapper.get<HTMLElement>('[data-testid="account-security-card"]').element.style.display).toBe('none');

    await wrapper.get('[data-testid="admin-tab-users"]').trigger('click');
    expect(wrapper.get<HTMLElement>('#user-management').element.style.display).toBe('');
    expect(wrapper.get<HTMLElement>('[data-testid="account-access-card"]').element.style.display).toBe('none');
  });

  it('hides the user management tab from non-administrators', async () => {
    const wrapper = mount(AccountView);
    await settle();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual(['登录与安全', '访问与集成']);
    expect(wrapper.get<HTMLElement>('[data-testid="account-security-card"]').element.style.display).toBe('');
  });

  it('registers a passkey with the browser and adds it to the list', async () => {
    apiRequest.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/api/admin/account') return { llmProvider: 'openai', llmModel: 'saved-model', hasLlmApiKey: false };
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
      if (url === '/api/admin/account') return { llmProvider: 'openai', llmModel: 'saved-model', hasLlmApiKey: false };
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
      if (url === '/api/admin/account') return { llmProvider: 'openai', llmModel: 'saved-model', hasLlmApiKey: false };
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
