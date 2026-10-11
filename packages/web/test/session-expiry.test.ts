import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../src/api/client';
import { router } from '../src/router/index';
import { useAuthStore } from '../src/stores/auth';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const unauthorized = () => json(401, { code: 401, data: null, message: 'Authentication required' });

describe('expired admin sessions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/auth/session') return json(200, { code: 0, data: { user: { id: 1, username: 'admin', role: 'admin' }, setupRequired: false }, message: '' });
      return unauthorized();
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the session and sends the user to login with the current path on an admin 401', async () => {
    await router.push('/admin/notabs');
    expect(router.currentRoute.value.path).toBe('/admin/notabs');
    const auth = useAuthStore();
    expect(auth.authenticated).toBe(true);

    // Callers keep their own error handling.
    await expect(apiRequest('/api/admin/links')).rejects.toThrow('Authentication required');
    await expect(apiRequest('/api/admin/folders')).rejects.toThrow('Authentication required');
    await flushPromises();

    expect(auth.user).toBeNull();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'), { timeout: 5000 });
    expect(router.currentRoute.value.query).toEqual({ next: '/admin/notabs' });
  });

  it('stays on public pages and ignores 401s from non-admin endpoints', async () => {
    const auth = useAuthStore();
    await router.push('/privacy');
    expect(auth.authenticated).toBe(true);

    await expect(apiRequest('/api/auth/login', { method: 'POST', body: '{}' })).rejects.toThrow();
    await flushPromises();
    expect(auth.authenticated).toBe(true);

    await expect(apiRequest('/api/admin/links')).rejects.toThrow('Authentication required');
    await flushPromises();
    expect(auth.user).toBeNull();
    expect(router.currentRoute.value.path).toBe('/privacy');
  });
});
