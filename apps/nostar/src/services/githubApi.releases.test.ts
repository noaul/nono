import { describe, expect, it, vi } from 'vitest';
import { GitHubApiService } from './githubApi';
import { createCustomReleaseRepository } from '../utils/releaseSources';
import { createRelease } from '../test/releaseFixtures';

describe('release refresh watermark', () => {
  it('retains existing first-page releases for content updates while keeping new releases incremental', async () => {
    const api = new GitHubApiService('test');
    const repo = {
      ...createCustomReleaseRepository('owner/app')!, has_fetched_releases: true, last_release_fetch_time: '2026-01-02T00:00:00Z',
      description: '', stargazers_count: 0, forks_count: 0, forks: 0, language: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', pushed_at: '2026-01-01T00:00:00Z', topics: [],
    };
    const old = createRelease({ body: 'Late notes' });
    const fresh = createRelease({ id: 2, published_at: '2026-01-03T00:00:00Z' });
    vi.spyOn(api, 'getRepositoryReleases').mockResolvedValue([fresh, old]);
    const result = await api.getMultipleRepositoryReleases([repo]);
    expect(result.releases.map(r => r.id)).toEqual([2]);
    expect(result).toMatchObject({ latestReleases: [
      { id: 2, repository: { id: repo.id } },
      { id: 1, body: 'Late notes', repository: { id: repo.id } },
    ] });
  });

  it('applies prerelease visibility to both new and existing first-page records', async () => {
    const api = new GitHubApiService('test');
    const repo = {
      ...createCustomReleaseRepository('owner/app')!, has_fetched_releases: true, last_release_fetch_time: '2026-01-02T00:00:00Z',
      description: '', stargazers_count: 0, forks_count: 0, forks: 0, language: null,
      created_at: '', updated_at: '', pushed_at: '', topics: [],
    };
    vi.spyOn(api, 'getRepositoryReleases').mockResolvedValue([
      createRelease({ id: 3, prerelease: true, published_at: '2026-01-03T00:00:00Z' }),
      createRelease({ id: 2, prerelease: true }), createRelease(),
    ]);
    const result = await api.getMultipleRepositoryReleases([repo], { includePreRelease: false });
    expect(result.releases).toEqual([]);
    expect(result.latestReleases.map(release => release.id)).toEqual([1]);
  });
});
