import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', () => ({
  apiRequest: vi.fn(async () => ({ authenticated: true, setupRequired: false, user: { id: 1, username: 'admin', role: 'admin' } })),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

describe('visiting /login while signed in', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetModules();
  });

  it('goes to a SPA next path instead of /admin', async () => {
    const { router } = await import('../src/router/index');
    await router.push('/login?next=%2Fadmin%2Flinks');
    expect(router.currentRoute.value.fullPath).toBe('/admin/links');
  });

  it('leaves the SPA for document paths such as /nodesk/', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    const { router } = await import('../src/router/index');
    await router.push('/login?next=%2Fnodesk%2F');
    expect(replace).toHaveBeenCalledWith('/nodesk/');
    vi.unstubAllGlobals();
  });

  it('ignores unsafe next values', async () => {
    const { router } = await import('../src/router/index');
    await router.push('/login?next=%2F%2Fevil.example');
    expect(router.currentRoute.value.path).toBe('/admin');
  });
});
