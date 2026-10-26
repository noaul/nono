import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from '../types';
import { GitHubApiService } from '../services/githubApi';
import { reconcileStarredRepositories } from './starSync';

const repo = (id: number, overrides: Partial<Repository> = {}): Repository => ({
  id, name: `repo-${id}`, full_name: `owner/repo-${id}`, description: null, html_url: `https://github.com/owner/repo-${id}`,
  stargazers_count: 1, forks_count: 0, forks: 0, language: null, created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z', pushed_at: '2026-01-01T00:00:00Z', owner: { login: 'owner', avatar_url: '' }, topics: [],
  ...overrides,
});

describe('reconcileStarredRepositories', () => {
  it('adopts a real id before a later rename without losing local analysis', async () => {
    const first = await reconcileStarredRepositories({ repositories: [repo(42, { full_name: 'owner/tool' })], complete: true },
      [repo(1_800_000_000_000, { full_name: 'owner/tool', ai_summary: 'keep' })], async () => false);
    expect(first.repositories[0].id).toBe(42);
    expect(first.foldedIds).toEqual([{ from: 1_800_000_000_000, to: 42 }]);
    const renamed = await reconcileStarredRepositories({ repositories: [repo(42, { full_name: 'owner/new' })], complete: true }, first.repositories, async () => false);
    expect(renamed.repositories).toEqual([expect.objectContaining({ id: 42, full_name: 'owner/new', ai_summary: 'keep' })]);
  });

  it('does not assign ambiguous legacy data to one of two real repositories sharing a name', async () => {
    const result = await reconcileStarredRepositories({ repositories: [repo(41, { full_name: 'o/tool' }), repo(42, { full_name: 'o/tool' })], complete: false },
      [repo(1_800_000_000_000, { full_name: 'o/tool', ai_summary: 'ambiguous' })], async () => false);
    expect(result.repositories.filter(r => r.id < 1e11).every(r => !r.ai_summary)).toBe(true);
    expect(result.repositories).toHaveLength(3);
  });
  it('keeps local repositories missing from an incomplete snapshot', async () => {
    const local = [repo(1, { custom_category: 'tools' }), repo(2, { custom_tags: ['keep'] })];
    const check = vi.fn(async () => false);

    const result = await reconcileStarredRepositories({ repositories: [repo(1)], complete: false }, local, check);

    expect(result.repositories.map(r => r.id)).toEqual([1, 2]);
    expect(result.repositories[1].custom_tags).toEqual(['keep']);
    expect(result.keptMissingCount).toBe(1);
    expect(check).not.toHaveBeenCalled();
  });

  it('keeps missing repositories when a re-check shows one is still starred', async () => {
    const local = [repo(1), repo(2, { custom_category: 'ai' })];
    const result = await reconcileStarredRepositories({ repositories: [repo(1)], complete: true }, local, async () => true);
    expect(result.repositories.map(r => r.id)).toEqual([1, 2]);
    expect(result.repositories[1].custom_category).toBe('ai');
  });

  it('drops repositories that were really unstarred and preserves local metadata on kept ones', async () => {
    const local = [repo(1, { custom_category: 'tools' }), repo(2)];
    const result = await reconcileStarredRepositories(
      { repositories: [repo(1, { stargazers_count: 9 }), repo(3)], complete: true },
      local,
      async () => false,
    );
    expect(result.repositories.map(r => r.id)).toEqual([1, 3]);
    expect(result.repositories[0]).toMatchObject({ custom_category: 'tools', stargazers_count: 9 });
    expect(result.newRepoCount).toBe(1);
    expect(result.keptMissingCount).toBe(0);
  });

  it('does not delete when the re-check itself fails', async () => {
    const result = await reconcileStarredRepositories({ repositories: [], complete: true }, [repo(1)], async () => { throw new Error('rate limited'); });
    expect(result.repositories.map(r => r.id)).toEqual([1]);
  });
});

describe('GitHubApiService.getStarredRepositoriesSnapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('pages by star time and de-duplicates ids, flagging a shifted list as incomplete', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => ({ starred_at: '2026-01-01T00:00:00Z', repo: repo(index + 1) }));
    // A new star pushed repo 100 onto page 2 while the sync was running.
    const page2 = [{ starred_at: '2026-01-01T00:00:00Z', repo: repo(100) }, { starred_at: '2026-01-01T00:00:00Z', repo: repo(101) }];
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const body = url.includes('page=1&') ? page1 : page2;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const api = new GitHubApiService('token');
    api.setBackendUrl(null);

    const snapshot = await api.getStarredRepositoriesSnapshot();

    expect(urls.every(url => url.includes('sort=created'))).toBe(true);
    expect(snapshot.repositories).toHaveLength(101);
    expect(new Set(snapshot.repositories.map(r => r.id)).size).toBe(101);
    expect(snapshot.complete).toBe(false);
  });
});
