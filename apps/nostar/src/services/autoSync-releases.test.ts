import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('../store/useAppStore');
import { useAppStore } from '../store/useAppStore';
import { backend } from './backendAdapter';
import { startAutoSync, stopAutoSync, syncFromBackend, syncToBackend } from './autoSync';
import { createRelease } from '../test/releaseFixtures';

function mockEmptyPull(releases: ReturnType<typeof createRelease>[]) {
  vi.spyOn(backend, 'fetchRepositories').mockResolvedValue({ repositories: [], total: 0 });
  const fetchReleases = vi.spyOn(backend, 'fetchReleases').mockResolvedValue({ releases, total: releases.length });
  vi.spyOn(backend, 'fetchAIConfigs').mockResolvedValue([]);
  vi.spyOn(backend, 'fetchWebDAVConfigs').mockResolvedValue([]);
  vi.spyOn(backend, 'fetchEmbeddingConfigs').mockResolvedValue([]);
  vi.spyOn(backend, 'fetchVectorSearchConfig').mockResolvedValue(useAppStore.getState().vectorSearchConfig);
  vi.spyOn(backend, 'fetchSettings').mockResolvedValue({});
  return fetchReleases;
}

describe('autoSync releases and push retry', () => {
  beforeEach(() => {
    stopAutoSync(() => {});
    useAppStore.setState({ repositories: [], releases: [createRelease({ id: 47 })], readReleases: new Set(), aiConfigs: [], webdavConfigs: [], embeddingConfigs: [] });
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
    vi.spyOn(backend, 'syncRepositories').mockResolvedValue();
    vi.spyOn(backend, 'syncReleases').mockResolvedValue();
    vi.spyOn(backend, 'syncAIConfigs').mockResolvedValue();
    vi.spyOn(backend, 'syncWebDAVConfigs').mockResolvedValue();
    vi.spyOn(backend, 'syncEmbeddingConfigs').mockResolvedValue();
    vi.spyOn(backend, 'syncVectorSearchConfig').mockResolvedValue();
    vi.spyOn(backend, 'syncSettings').mockResolvedValue();
  });

  afterEach(() => {
    stopAutoSync(() => {});
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('honors an empty server snapshot so another device deletion is not resurrected', async () => {
    mockEmptyPull([]);

    await syncFromBackend();

    expect(useAppStore.getState().releases).toEqual([]);
    expect(backend.syncReleases).not.toHaveBeenCalled();
  });

  it('preserves edits made while a poll is pending without adopting its baselines', async () => {
    vi.useFakeTimers();
    mockEmptyPull([]);
    vi.spyOn(backend, 'isTokenStoredOnServer').mockResolvedValue(false);
    let resolvePull!: (value: { repositories: never[]; total: number }) => void;
    vi.mocked(backend.fetchRepositories).mockReturnValue(new Promise(resolve => { resolvePull = resolve; }));
    const accept = vi.spyOn(backend, 'acceptSyncBaselines');
    startAutoSync();
    const pull = syncFromBackend();
    useAppStore.setState({ repositories: [{ id: 42, full_name: 'owner/repo', custom_description: 'edited during poll' }] as never });
    resolvePull({ repositories: [], total: 0 });
    await pull;
    expect(useAppStore.getState().repositories[0]?.custom_description).toBe('edited during poll');
    expect(accept).not.toHaveBeenCalled();
    expect(backend.fetchRepositories).toHaveBeenCalledWith(false);
    expect(backend.fetchReleases).toHaveBeenCalledWith(false);
    expect(backend.fetchSettings).toHaveBeenCalledWith(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(backend.syncRepositories).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ custom_description: 'edited during poll' })]));
  });

  it('retries a failed push with backoff so pulls are not blocked forever', async () => {
    vi.useFakeTimers();
    const syncReleases = vi.spyOn(backend, 'syncReleases').mockRejectedValueOnce(new Error('backend down')).mockResolvedValue();

    await syncToBackend();
    expect(syncReleases).toHaveBeenCalledTimes(1);

    // While the push is pending, pulls are skipped so they cannot overwrite local edits.
    const fetchReleases = mockEmptyPull([createRelease({ id: 47 })]);
    await syncFromBackend();
    expect(fetchReleases).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(syncReleases).toHaveBeenCalledTimes(2);

    // The successful retry clears the pending flag and pulls resume.
    await syncFromBackend();
    expect(fetchReleases).toHaveBeenCalledTimes(1);
  });
});
