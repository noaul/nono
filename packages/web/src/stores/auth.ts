import { defineStore } from 'pinia';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { apiRequest, jsonBody } from '@/api/client';
import type { SessionPayload, User } from '@/api/types';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    setupRequired: false,
    loaded: false,
  }),
  getters: {
    authenticated: (state) => Boolean(state.user),
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    async loadSession() {
      const session = await apiRequest<SessionPayload>('/api/auth/session');
      this.user = session.user;
      this.setupRequired = session.setupRequired;
      this.loaded = true;
      return session;
    },
    async setup(input: { username: string; email: string; displayName?: string; password: string; bootstrapToken?: string }) {
      const result = await apiRequest<{ user: User }>('/api/auth/setup', { method: 'POST', body: jsonBody(input) });
      this.user = result.user;
      this.setupRequired = false;
      return result.user;
    },
    async login(input: { username: string; password: string }) {
      const result = await apiRequest<{ user: User }>('/api/auth/login', { method: 'POST', body: jsonBody(input) });
      this.user = result.user;
      return result.user;
    },
    async loginWithPasskey() {
      const authentication = await apiRequest<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>('/api/auth/passkey/options', { method: 'POST' });
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const response = await startAuthentication({ optionsJSON: authentication.options });
      const result = await apiRequest<{ user: User }>('/api/auth/passkey/login', {
        method: 'POST',
        body: jsonBody({ challengeId: authentication.challengeId, response }),
      });
      this.user = result.user;
      return result.user;
    },
    async register(input: { username: string; email: string; displayName?: string; password: string }) {
      const result = await apiRequest<{ user: User }>('/api/auth/register', { method: 'POST', body: jsonBody(input) });
      return result.user;
    },
    async logout() {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      this.user = null;
    },
  },
});
