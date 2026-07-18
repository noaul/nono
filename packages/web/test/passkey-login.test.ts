import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginView from '../src/views/LoginView.vue';

const apiRequest = vi.fn();
const startAuthentication = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
}));

describe('passkey login', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    startAuthentication.mockReset();
  });

  it('authenticates with a browser passkey and enters the admin', async () => {
    apiRequest
      .mockResolvedValueOnce({ options: { challenge: 'login-challenge' }, challengeId: 'challenge-1' })
      .mockResolvedValueOnce({
        user: { id: 1, username: 'admin', email: 'admin@nono.test', displayName: 'Admin', role: 'admin' },
      });
    startAuthentication.mockResolvedValue({ id: 'credential-1', response: {} });
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', component: LoginView },
        { path: '/admin', component: { template: '<main>Admin</main>' } },
        { path: '/setup', component: { template: '<main>Setup</main>' } },
      ],
    });
    await router.push('/login');
    await router.isReady();
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } });

    await wrapper.get('[data-testid="passkey-login"]').trigger('click');
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'login-challenge' } });
    expect(apiRequest).toHaveBeenLastCalledWith('/api/auth/passkey/login', {
      method: 'POST',
      body: JSON.stringify({
        challengeId: 'challenge-1',
        response: { id: 'credential-1', response: {} },
      }),
    });
    expect(router.currentRoute.value.path).toBe('/admin');
  });
});
