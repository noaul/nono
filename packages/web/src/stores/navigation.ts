import { defineStore } from 'pinia';
import { apiRequest } from '@/api/client';
import type { NavigationPayload } from '@/api/types';

const CACHE_PREFIX = 'nono:navigation:';

function clearLegacyCache(username: string) {
  try {
    localStorage.removeItem(CACHE_PREFIX + username);
  } catch {
    // Storage can be unavailable in privacy modes; the network remains authoritative.
  }
}

export const useNavigationStore = defineStore('navigation', {
  state: () => ({
    payload: null as NavigationPayload | null,
    loading: false,
    error: '',
  }),
  actions: {
    updateSite(username: string, site: NavigationPayload['site']) {
      if (!this.payload) return;
      this.payload = {
        ...this.payload,
        site: { ...this.payload.site, ...site },
      };
      clearLegacyCache(username);
    },
    async load(username = 'admin', query = '', preservePayload = false) {
      clearLegacyCache(username);
      if (!preservePayload) this.payload = null;
      this.loading = !preservePayload;
      this.error = '';
      try {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
        this.payload = await apiRequest<NavigationPayload>(`/api/navigation/${encodeURIComponent(username)}${suffix}`);
        return this.payload;
      } catch (error) {
        this.error = error instanceof Error ? error.message : '导航内容加载失败';
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async unlock(username: string, password: string) {
      const result = await apiRequest<{ unlocked: boolean }>(`/api/navigation/${encodeURIComponent(username)}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      if (result.unlocked) await this.load(username, '', true);
      return result.unlocked;
    },
  },
});
