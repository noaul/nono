import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('./useAppStore');
import { useAppStore } from './useAppStore';
import type { Repository } from '../types';

const repo = (id: number, full_name: string, overrides: Partial<Repository> = {}): Repository => ({
  id, name: full_name.split('/')[1], full_name, description: null, html_url: `https://github.com/${full_name}`,
  stargazers_count: 0, forks_count: 0, forks: 0, language: null, created_at: '', updated_at: '', pushed_at: '',
  owner: { login: full_name.split('/')[0], avatar_url: '' }, topics: [], ...overrides,
});

beforeEach(() => { localStorage.clear(); useAppStore.setState({ repositories: [], searchResults: [], releases: [], readReleases: new Set(), releaseSubscriptions: new Set(), releaseExpandedRepositories: new Set() }); });

describe('addRepository identity', () => {
  it('keeps the real GitHub id for a new repository', () => {
    useAppStore.getState().addRepository(repo(987654321, 'owner/new'));
    expect(useAppStore.getState().repositories.map(r => r.id)).toEqual([987654321]);
  });

  it('adds a repository that reused an old name as its own record', () => {
    useAppStore.setState({ repositories: [repo(1, 'owner/name', { ai_summary: 'old' })] });
    useAppStore.getState().addRepository(repo(2, 'owner/name'));
    const repositories = useAppStore.getState().repositories;
    expect(repositories.map(r => [r.id, r.ai_summary])).toEqual([[1, 'old'], [2, undefined]]);
  });

  it('updates the same GitHub id in place and keeps analysis and custom fields', () => {
    useAppStore.setState({ repositories: [repo(1, 'owner/old', { ai_summary: 'summary', ai_tags: ['a'], analyzed_at: '2026-01-01', custom_category: 'tools', category_locked: true })] });
    useAppStore.getState().addRepository(repo(1, 'owner/new', { stargazers_count: 9 }));
    expect(useAppStore.getState().repositories).toEqual([expect.objectContaining({
      id: 1, full_name: 'owner/new', stargazers_count: 9, ai_summary: 'summary', ai_tags: ['a'], analyzed_at: '2026-01-01', custom_category: 'tools', category_locked: true,
    })]);
  });

  it('claims a legacy synthetic-id record from an earlier batch star by name', () => {
    useAppStore.setState({ repositories: [repo(1_800_000_000_000, 'Owner/Tool', { ai_summary: 'kept' })] });
    useAppStore.getState().addRepository(repo(55, 'owner/tool'));
    expect(useAppStore.getState().repositories).toEqual([expect.objectContaining({ id: 55, full_name: 'owner/tool', ai_summary: 'kept' })]);
  });

  it('atomically folds synthetic twins and preserves release references, read state and subscriptions', () => {
    const stale = repo(1_800_000_000_000, 'owner/tool', { ai_summary: 'kept', custom_category: 'locked', category_locked: true });
    const canonical = repo(55, 'owner/tool', { category_locked: false });
    useAppStore.setState({ repositories: [stale, canonical], releaseSubscriptions: new Set([stale.id]),
      releaseExpandedRepositories: new Set([stale.id]), readReleases: new Set([7]),
      releases: [{ id: 7, tag_name: 'v1', name: 'v1', body: '', published_at: '', html_url: '', assets: [], repository: stale }],
    });
    useAppStore.getState().addRepository(canonical);
    const state = useAppStore.getState();
    expect(state.repositories).toEqual([expect.objectContaining({ id: 55, ai_summary: 'kept', custom_category: 'locked', category_locked: true })]);
    expect([...state.releaseSubscriptions]).toEqual([55]);
    expect([...state.releaseExpandedRepositories]).toEqual([55]);
    expect(state.releases[0].repository.id).toBe(55);
    expect([...state.readReleases]).toEqual([7]);
  });

  it('normalizes a stale synthetic backup against an existing real identity', () => {
    useAppStore.setState({ repositories: [repo(55, 'owner/tool', { ai_summary: 'current' })] });
    useAppStore.getState().setRepositories([repo(1_800_000_000_000, 'owner/tool', { custom_category: 'imported' })]);
    expect(useAppStore.getState().repositories).toEqual([expect.objectContaining({ id: 55, custom_category: 'imported' })]);
  });

  it('keeps canonical analysis when an imported array also contains its stale synthetic twin', () => {
    useAppStore.getState().setRepositories([repo(55, 'owner/tool', { ai_summary: 'current' }), repo(1_800_000_000_000, 'owner/tool', { custom_category: 'imported' })]);
    expect(useAppStore.getState().repositories).toEqual([expect.objectContaining({ id: 55, ai_summary: 'current', custom_category: 'imported' })]);
  });

  it('falls back to a synthetic id only when the GitHub id is unusable', () => {
    useAppStore.getState().addRepository(repo(0, 'owner/odd'));
    expect(useAppStore.getState().repositories[0].id).toBeGreaterThanOrEqual(1e11);
  });
});
