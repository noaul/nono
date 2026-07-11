import { defineStore } from 'pinia';
import { apiRequest } from '@/api/client';
import type { NavigationPayload } from '@/api/types';

export const useNavigationStore = defineStore('navigation', {
  state: () => ({
    payload: null as NavigationPayload | null,
    loading: false,
    error: '',
  }),
  actions: {
    async load(username = 'admin', query = '') {
      this.loading = true;
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
  },
});
