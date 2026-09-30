import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseTimeline } from './ReleaseTimeline';
import { useAppStore } from '../store/useAppStore';
import { createRelease, createReleaseAsset } from '../test/releaseFixtures';
import { createCustomReleaseRepository, CUSTOM_RELEASE_SOURCE_ID } from '../utils/releaseSources';
import { GitHubApiService } from '../services/githubApi';
import type { AssetFilter } from '../types';

vi.unmock('../store/useAppStore');
vi.mock('../hooks/useDialog', () => ({ useDialog: () => ({ toast: vi.fn(), confirm: vi.fn() }) }));

describe('release filter and refresh behavior', () => {
  beforeEach(() => {
    useAppStore.setState({
      releases: [createRelease({ name: 'app' })], readReleases: new Set([1]),
      repositories: [], releaseSubscriptions: new Set(), githubToken: 'test', language: 'en',
      releaseSourceSettings: { enabledSourceIds: [CUSTOM_RELEASE_SOURCE_ID], watchCustomReleaseRepos: [], customReleaseRepos: [createCustomReleaseRepository('owner/app')!] },
      releaseSelectedFilters: ['custom'], releaseShowMode: 'all', releaseLatestMode: 'all',
      releaseViewMode: 'timeline', releaseSearchQuery: '', releaseIsRefreshing: false,
      assetFilters: [{ id: 'custom', name: 'Test', keywords: ['linux'] }],
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  const setFilter = (rules: Partial<AssetFilter>) => {
    useAppStore.setState({ assetFilters: [{ id: 'custom', name: 'Test', keywords: [], ...rules }] });
  };

  it('excludes a repository before its always-include and keyword rules', () => {
    setFilter({ keywords: ['linux'], includeRepos: ['OWNER/APP'], alwaysExcludeRepos: ['owner/app'] });
    render(<ReleaseTimeline />);
    expect(screen.queryByRole('heading', { name: 'app' })).not.toBeInTheDocument();
  });

  it('always includes a repository with no matching assets', () => {
    setFilter({ keywords: ['windows'], includeRepos: ['OWNER/APP'] });
    render(<ReleaseTimeline />);
    expect(screen.getByRole('heading', { name: 'app' })).toBeInTheDocument();
  });

  it('hides releases whose real assets all hit the blacklist despite generated archives', () => {
    setFilter({ excludeKeywords: ['linux'] });
    render(<ReleaseTimeline />);
    expect(screen.queryByRole('heading', { name: 'app' })).not.toBeInTheDocument();
  });

  it('does not let automatic source archive extensions match every release', () => {
    setFilter({ keywords: ['zip'] });
    useAppStore.setState({ releases: [createRelease({ name: 'Release fixture', assets: [createReleaseAsset({ name: 'app.whl' })] })] });
    render(<ReleaseTimeline />);
    expect(screen.queryByRole('heading', { name: 'app' })).not.toBeInTheDocument();
  });

  it('applies edited preset filters instead of also applying the original preset', () => {
    useAppStore.setState({ releaseSelectedFilters: ['preset-linux'], assetFilters: [{ id: 'preset-linux', name: 'Linux', keywords: ['linux'], excludeKeywords: ['zip'] } as AssetFilter] });
    render(<ReleaseTimeline />);
    expect(screen.queryByRole('heading', { name: 'app' })).not.toBeInTheDocument();
  });

  it('displays only the union of links contributed by matching filters', () => {
    useAppStore.setState({
      releases: [createRelease({ assets: [createReleaseAsset(), createReleaseAsset({ id: 101, name: 'app-linux-debug.zip' })], body: '[Windows download](https://example.com/app.exe)' })],
      releaseSelectedFilters: ['linux', 'windows', 'excluded', 'empty'],
      assetFilters: [
        { id: 'linux', name: 'Linux', keywords: ['linux'], excludeKeywords: ['debug'] },
        { id: 'windows', name: 'Windows', keywords: ['windows'] },
        { id: 'excluded', name: 'Excluded', keywords: ['source'], alwaysExcludeRepos: ['owner/app'] },
        { id: 'empty', name: 'Empty', keywords: [] },
      ],
    });
    render(<ReleaseTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Assets' }));
    expect(screen.getByRole('link', { name: /app-linux.zip/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Windows download' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /debug/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Source code/ })).not.toBeInTheDocument();
  });

  it('allows another selected filter to include a repository excluded by one filter', () => {
    useAppStore.setState({
      releaseSelectedFilters: ['excluded', 'included'],
      assetFilters: [
        { id: 'excluded', name: 'Excluded', keywords: ['linux'], alwaysExcludeRepos: ['owner/app'] },
        { id: 'included', name: 'Included', keywords: [], includeRepos: ['owner/app'] },
      ],
    });
    render(<ReleaseTimeline />);
    expect(screen.getByRole('heading', { name: 'app' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Assets' }));
    expect(screen.getAllByRole('link', { name: /Source code/ })).toHaveLength(2);
  });

  it('updates existing content from the fetched first page even with no new releases', async () => {
    useAppStore.setState({ releaseSelectedFilters: [] });
    vi.spyOn(GitHubApiService.prototype, 'getMultipleRepositoryReleases').mockResolvedValue({
      releases: [], failedRepos: [], latestReleases: [createRelease({ name: 'Release fixture', body: 'New release notes' })],
    });
    render(<ReleaseTimeline />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Refresh' })[0]);
    await waitFor(() => expect(useAppStore.getState().releases[0].body).toBe('New release notes'));
    expect(useAppStore.getState().readReleases.has(1)).toBe(false);
  });
});
