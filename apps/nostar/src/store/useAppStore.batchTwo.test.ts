import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
vi.unmock('./useAppStore');
import { useAppStore } from './useAppStore';
import { matchesCategory } from '../utils/categoryUtils';
import type { Repository } from '../types';
const repository: Repository = {
  id: 2,
  name: 'Repo',
  full_name: 'Owner/Repo',
  description: null,
  html_url: 'https://github.com/Owner/Repo',
  stargazers_count: 1,
  forks_count: 0,
  forks: 0,
  language: null,
  created_at: '',
  updated_at: '',
  pushed_at: '',
  owner: { login: 'Owner', avatar_url: '' },
  topics: [],
};
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem('nostar:nono-user-id');
});
beforeEach(() => {
  useAppStore.setState({
    customCategories: [],
    repositories: [repository],
    categoryListIdMap: {},
    githubListMemberships: {},
  });
});
describe('batch two integration', () => {
  it('imports many Lists for one repository without losing unrelated categories or starring absent repos', () => {
    useAppStore.getState().importGitHubLists([
      {
        id: 'a',
        name: 'Tools',
        isPrivate: false,
        items: ['owner/repo', 'unknown/repo'],
      },
      { id: 'b', name: 'Reading', isPrivate: false, items: ['owner/repo'] },
    ]);
    const state = useAppStore.getState();
    expect(state.repositories).toHaveLength(1);
    expect(state.customCategories).toHaveLength(2);
    for (const category of state.customCategories)
      expect(
        matchesCategory(
          state.repositories[0],
          category,
          state.githubListMemberships
        )
      ).toBe(true);
    expect(Object.values(state.githubListMemberships).flat()).toContain(
      'unknown/repo'
    );
    state.importGitHubLists([
      { id: 'a', name: 'Tools', isPrivate: false, items: [] },
    ]);
    expect(useAppStore.getState().customCategories).toHaveLength(2);
  });
  it('removes local Lists mapping when deleting its category without changing Stars', () => {
    const state = useAppStore.getState();
    state.importGitHubLists([
      { id: 'a', name: 'Tools', isPrivate: false, items: ['owner/repo'] },
    ]);
    state.deleteCustomCategory('github-list-a');
    expect(useAppStore.getState().categoryListIdMap).toEqual({});
    expect(useAppStore.getState().githubListMemberships).toEqual({});
    expect(useAppStore.getState().repositories).toHaveLength(1);
  });
  it('edits imported local memberships without modifying stars or other Lists', () => {
    const state = useAppStore.getState();
    state.importGitHubLists([
      { id: 'a', name: 'Tools', isPrivate: false, items: ['owner/repo'] },
      { id: 'b', name: 'Reading', isPrivate: false, items: ['owner/repo'] },
    ]);
    state.setLocalListMembers('github-list-a', []);
    expect(useAppStore.getState().githubListMemberships).toEqual({
      'github-list-a': [],
      'github-list-b': ['owner/repo'],
    });
    expect(useAppStore.getState().repositories).toHaveLength(1);
  });
  it('clears user preferences and mapping when logging out', () => {
    const state = useAppStore.getState();
    state.setDisplayPreferences({ fontSize: 'large', reducedMotion: true });
    state.setCategoryListIdMap({ cat: 'id' });
    state.logout();
    expect(useAppStore.getState().categoryListIdMap).toEqual({});
    expect(useAppStore.getState().githubListMemberships).toEqual({});
    expect(useAppStore.getState().displayPreferences.fontSize).toBe('default');
  });
});

it('does not flush the previous user snapshot into a newly selected user scope', async () => {
  const { indexedDBStorage } = await import('../services/indexedDbStorage');
  const { setStorageScope } = await import('../services/storageScope');
  await useAppStore.persist.rehydrate();
  const write = vi
    .spyOn(indexedDBStorage, 'setItem')
    .mockResolvedValue(undefined);
  setStorageScope('account-one');
  useAppStore.getState().setDisplayPreferences({ fontSize: 'large' });
  setStorageScope('account-two');
  window.dispatchEvent(new Event('pagehide'));
  expect(write).not.toHaveBeenCalled();
  write.mockRestore();
});
