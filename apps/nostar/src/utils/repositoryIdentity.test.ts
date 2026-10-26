import { describe, expect, it } from 'vitest';
import type { Repository } from '../types';
import {
  SYNTHETIC_REPOSITORY_ID_FLOOR,
  assignIdentityMatches,
  findIdentityMatch,
  generateFallbackRepositoryId,
  isValidGitHubRepositoryId,
  canonicalizeImportedRepositoryReferences,
} from './repositoryIdentity';

const repo = (id: number, full_name: string): Repository => ({
  id, name: full_name.split('/')[1], full_name, description: null, html_url: `https://github.com/${full_name}`,
  stargazers_count: 0, forks_count: 0, forks: 0, language: null, created_at: '', updated_at: '', pushed_at: '',
  owner: { login: full_name.split('/')[0], avatar_url: '' }, topics: [],
});
const synthetic = SYNTHETIC_REPOSITORY_ID_FLOOR * 17;

describe('repository identity', () => {
  it('remaps imported releases and subscriptions using their legacy repository record', () => {
    const result = canonicalizeImportedRepositoryReferences({ repositories: [repo(synthetic, 'owner/tool')],
      releases: [{ id: 7, repository: { id: synthetic, full_name: 'owner/tool', name: 'tool' } }], releaseSubscriptions: [synthetic], readReleases: [7],
    }, [repo(42, 'owner/tool')]);
    expect(result.releases[0].repository.id).toBe(42);
    expect(result.releaseSubscriptions).toEqual([42]);
    expect(result.readReleases).toEqual([7]);
  });
  it('only treats positive integers below the synthetic floor as GitHub ids', () => {
    expect(isValidGitHubRepositoryId(123)).toBe(true);
    expect(isValidGitHubRepositoryId(0)).toBe(false);
    expect(isValidGitHubRepositoryId(1.5)).toBe(false);
    expect(isValidGitHubRepositoryId('123')).toBe(false);
    expect(isValidGitHubRepositoryId(synthetic)).toBe(false);
  });

  it('matches a rename by id and never claims a real-id record by name', () => {
    const local = [repo(1, 'owner/old')];
    expect(findIdentityMatch(repo(1, 'owner/new'), local)).toBe(local[0]);
    expect(findIdentityMatch(repo(2, 'owner/old'), local)).toBeUndefined();
  });

  it('lets a legacy synthetic-id record be claimed by name, case-insensitively', () => {
    const local = [repo(synthetic, 'Owner/Tool')];
    expect(findIdentityMatch(repo(42, 'owner/tool'), local)).toBe(local[0]);
  });

  it('prefers an id match over the name fallback', () => {
    const local = [repo(synthetic, 'owner/tool'), repo(42, 'owner/tool-renamed')];
    expect(findIdentityMatch(repo(42, 'owner/tool'), local)).toBe(local[1]);
  });

  it('assigns each local record once, independent of batch order', () => {
    const local = [repo(1, 'owner/old'), repo(synthetic, 'owner/legacy')];
    const renamed = repo(1, 'owner/new');
    const reused = repo(2, 'owner/old');
    const fromLegacy = repo(3, 'owner/legacy');
    expect(assignIdentityMatches([reused, renamed, fromLegacy], local)).toEqual([undefined, local[0], local[1]]);
    expect(assignIdentityMatches([renamed, reused, fromLegacy], local)).toEqual([local[0], undefined, local[1]]);
    expect(assignIdentityMatches([repo(4, 'owner/legacy'), repo(5, 'owner/legacy')], local)).toEqual([undefined, undefined]);
    expect(assignIdentityMatches([], local)).toEqual([]);
  });

  it('generates fallback ids above every existing id and the synthetic floor', () => {
    const id = generateFallbackRepositoryId([repo(synthetic * 2, 'owner/x')]);
    expect(id).toBeGreaterThan(synthetic * 2);
    expect(generateFallbackRepositoryId([])).toBeGreaterThanOrEqual(SYNTHETIC_REPOSITORY_ID_FLOOR);
  });
});
