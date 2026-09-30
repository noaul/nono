import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelease, createReleaseAsset } from '../test/releaseFixtures';
import type { AppState } from '../types';

let useAppStore: typeof import('./useAppStore').useAppStore;
let normalizePersistedState: typeof import('./useAppStore').normalizePersistedState;
beforeAll(async () => {
  ({ useAppStore, normalizePersistedState } = await vi.importActual<typeof import('./useAppStore')>('./useAppStore'));
});

describe('release refresh and filter compatibility', () => {
  beforeEach(() => {
    useAppStore.setState({ releases: [createRelease({ is_read: true })], readReleases: new Set([1]) });
  });

  it('fills in newly added release notes and makes the existing release unread', () => {
    useAppStore.getState().addReleases([createRelease({ body: 'Added release notes' })]);
    expect(useAppStore.getState().releases).toHaveLength(1);
    expect(useAppStore.getState().releases[0]).toMatchObject({ body: 'Added release notes', is_read: false });
    expect(useAppStore.getState().readReleases.has(1)).toBe(false);
  });

  it('refreshes a prerelease promoted to stable and makes it unread', () => {
    useAppStore.setState({ releases: [createRelease({ prerelease: true, is_read: true })] });
    useAppStore.getState().addReleases([createRelease({ prerelease: false })]);
    expect(useAppStore.getState().releases[0]).toMatchObject({ prerelease: false, is_read: false });
    expect(useAppStore.getState().readReleases.has(1)).toBe(false);
  });

  it.each([
    { assets: [createReleaseAsset({ updated_at: '2026-01-02T00:00:00Z' })] },
    { assets: [createReleaseAsset({ size: 2048 })] },
    { assets: [] },
    { name: 'Renamed release' },
    { tag_name: 'v2' },
  ])('makes a meaningful existing release change unread: %j', (patch) => {
    useAppStore.getState().addReleases([createRelease(patch)]);
    expect(useAppStore.getState().readReleases.has(1)).toBe(false);
    expect(useAppStore.getState().releases[0]).toMatchObject(patch);
  });

  it('ignores download count and display fallback differences without notifying subscribers', () => {
    const previous = useAppStore.getState().releases;
    let notifications = 0;
    const unsubscribe = useAppStore.subscribe(() => { notifications++; });
    useAppStore.getState().addReleases([createRelease({
      name: 'v1', body: '', prerelease: false, assets: [createReleaseAsset({ download_count: 20 })],
    })]);
    unsubscribe();
    expect(notifications).toBe(0);
    expect(useAppStore.getState().releases).toBe(previous);
    expect(useAppStore.getState().readReleases.has(1)).toBe(true);
  });

  it('deduplicates repeated incoming release IDs', () => {
    const next = createRelease({ id: 2 });
    useAppStore.getState().addReleases([next, next]);
    expect(useAppStore.getState().releases.map(r => r.id)).toEqual([1, 2]);
  });

  it('hydrates old filters while sanitizing rules and dropping retired excludeRepos', () => {
    const state = normalizePersistedState({ assetFilters: [
      { id: 'legacy', name: 'Old', keywords: [' mac ', 'MAC', '', 3], excludeRepos: ['owner/app'] },
      { id: 'new', name: 'Rules', keywords: [], excludeKeywords: [' debug ', 'DEBUG'], includeRepos: [' Owner/App ', 'owner/app'], alwaysExcludeRepos: ['owner/other'] },
      { id: 'invalid', name: 'Missing keywords' },
    ] } as unknown as Partial<AppState>, useAppStore.getState());
    expect(state.assetFilters).toEqual([
      { id: 'legacy', name: 'Old', keywords: ['mac'] },
      { id: 'new', name: 'Rules', keywords: [], excludeKeywords: ['debug'], includeRepos: ['Owner/App'], alwaysExcludeRepos: ['owner/other'] },
    ]);
  });
});
