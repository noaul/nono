import { afterEach, describe, expect, it, vi } from 'vitest';
import { backend } from './backendAdapter';
import { startAutoSync, stopAutoSync } from './autoSync';
import { SERVER_MANAGED_GITHUB_TOKEN } from './githubApi';

const store = vi.hoisted(() => {
  const state = {
    githubToken: null as string | null,
    setGitHubToken(token: string | null) {
      state.githubToken = token;
    },
  };
  const useAppStore = Object.assign(
    vi.fn((selector?: (value: typeof state) => unknown) => selector ? selector(state) : state),
    {
      getState: () => state,
      subscribe: () => () => undefined,
    },
  );
  return { state, useAppStore };
});

vi.mock('../store/useAppStore', () => ({ useAppStore: store.useAppStore }));

describe('autoSync GitHub token handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps GitHub features enabled without persisting the real server token in the browser', async () => {
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
    vi.spyOn(backend, 'isTokenStoredOnServer').mockResolvedValue(true);
    store.state.githubToken = null;

    const unsubscribe = startAutoSync();
    await vi.waitFor(() => {
      expect(store.state.githubToken).toBe(SERVER_MANAGED_GITHUB_TOKEN);
    });
    stopAutoSync(unsubscribe);
  });
});
