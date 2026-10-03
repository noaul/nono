import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../src/stores/auth';

const api = vi.hoisted(() => vi.fn());
const clearNative = vi.hoisted(() => vi.fn());
const canClear = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({ apiRequest: api, jsonBody: JSON.stringify }));
vi.mock('@/mobile/shell', () => ({ clearNativeSession: clearNative, canClearNativeSession: canClear }));

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); canClear.mockReturnValue(true); });
describe('shared logout', () => {
  it('revokes the server session before clearing the device', async () => {
    api.mockResolvedValueOnce({});
    const store = useAuthStore();
    expect(await store.logout()).toBe(true);
    expect(clearNative).toHaveBeenCalledOnce();
  });
  it('lets the user explicitly clear the device if server logout fails', async () => {
    api.mockRejectedValueOnce(new TypeError('offline'));
    const store = useAuthStore();
    expect(await store.logout(async () => true)).toBe(true);
    expect(clearNative).toHaveBeenCalledOnce();
  });
  it('keeps the session when local logout is declined', async () => {
    api.mockRejectedValueOnce(new TypeError('offline'));
    expect(await useAuthStore().logout(async () => false)).toBe(false);
    expect(clearNative).not.toHaveBeenCalled();
  });
  it('surfaces browser logout failures without pretending cookies were cleared', async () => {
    canClear.mockReturnValue(false);
    api.mockRejectedValueOnce(new TypeError('offline'));
    await expect(useAuthStore().logout(async () => true)).rejects.toThrow('offline');
    expect(clearNative).not.toHaveBeenCalled();
  });
});
