import { defineStore } from 'pinia';
import { apiRequest } from '@/api/client';
import type { NavigationPayload } from '@/api/types';

const CACHE_PREFIX = 'nono:navigation:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedNavigation = { payload: NavigationPayload; savedAt: number };

function readCache(username: string): NavigationPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + username);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedNavigation;
    if (!parsed?.payload?.site || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeCache(username: string, payload: NavigationPayload) {
  try {
    localStorage.setItem(CACHE_PREFIX + username, JSON.stringify({ payload, savedAt: Date.now() } satisfies CachedNavigation));
  } catch {
    // Quota exceeded or storage unavailable — cache is best-effort only.
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
      writeCache(username, this.payload);
    },
    /**
     * Stale-while-revalidate: unfiltered loads render the cached payload
     * immediately (if any), then refresh from the network in the background.
     */
    async load(username = 'admin', query = '') {
      const cached = !query ? readCache(username) : null;
      if (cached && !this.payload) this.payload = cached;

      this.loading = !cached;
      this.error = '';
      try {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
        this.payload = await apiRequest<NavigationPayload>(`/api/navigation/${encodeURIComponent(username)}${suffix}`);
        if (!query) writeCache(username, this.payload);
        return this.payload;
      } catch (error) {
        // Keep showing cached content if the refresh fails; only surface the error cold.
        if (!this.payload) {
          this.error = error instanceof Error ? error.message : '导航内容加载失败';
        }
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
