import { defineStore } from 'pinia';
import { apiRequest } from '@/api/client';
import type { NavigationPayload } from '@/api/types';

export const useNavigationStore = defineStore('navigation', {
  state: () => ({
    payload: null as NavigationPayload | null,
    loading: false,
  }),
  actions: {
    async load(username = 'admin', query = '') {
      this.loading = true;
      try {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
        this.payload = await apiRequest<NavigationPayload>(`/api/navigation/${encodeURIComponent(username)}${suffix}`);
        return this.payload;
      } finally {
        this.loading = false;
      }
    },
  },
});
