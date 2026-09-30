import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.unmock('../store/useAppStore');
import { useAppStore } from '../store/useAppStore';
import { backend } from './backendAdapter';
import { syncFromBackend, syncToBackend, stopAutoSync } from './autoSync';
import { createRelease } from '../test/releaseFixtures';

describe('Release and translation settings sync', () => {
  beforeEach(() => {
    stopAutoSync(() => {});
    useAppStore.setState({repositories: [], releases: [createRelease({id: 47, is_read: false})], readReleases: new Set([47]), releaseSubscriptions: new Set([10]), aiConfigs: [], webdavConfigs: [], embeddingConfigs: [], translationEngine: 'google', defaultCategoryOverrides: {tools: {name: 'Custom tools'}}});
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
    vi.spyOn(backend, 'syncRepositories').mockResolvedValue();
    vi.spyOn(backend, 'syncReleases').mockResolvedValue();
    vi.spyOn(backend, 'syncAIConfigs').mockResolvedValue();
    vi.spyOn(backend, 'syncWebDAVConfigs').mockResolvedValue();
    vi.spyOn(backend, 'syncEmbeddingConfigs').mockResolvedValue();
    vi.spyOn(backend, 'syncVectorSearchConfig').mockResolvedValue();
    vi.spyOn(backend, 'syncSettings').mockResolvedValue();
  });
  afterEach(() => {stopAutoSync(() => {}); vi.restoreAllMocks();});
  it('sends the current read Set and new preferences to the per-user backend', async () => {
    await syncToBackend();
    expect(backend.syncReleases).toHaveBeenCalledWith([expect.objectContaining({id: 47, is_read: true})]);
    expect(backend.syncSettings).toHaveBeenCalledWith(expect.objectContaining({translationEngine: 'google', releaseSubscriptions: [10], defaultCategoryOverrides: {tools: {name: 'Custom tools'}}}));
  });
  it('adopts remote read flags and preferences including explicit empty subscriptions', async () => {
    vi.spyOn(backend, 'fetchRepositories').mockResolvedValue({repositories: [], total: 0});
    vi.spyOn(backend, 'fetchReleases').mockResolvedValue({releases: [createRelease({id: 92, is_read: true})], total: 1});
    vi.spyOn(backend, 'fetchAIConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchWebDAVConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchEmbeddingConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchVectorSearchConfig').mockResolvedValue(useAppStore.getState().vectorSearchConfig);
    vi.spyOn(backend, 'fetchSettings').mockResolvedValue({translationEngine: 'microsoft', releaseSubscriptions: [], defaultCategoryOverrides: {}});
    await syncFromBackend();
    expect([...useAppStore.getState().readReleases]).toEqual([92]);
    expect([...useAppStore.getState().releaseSubscriptions]).toEqual([]);
    expect(useAppStore.getState().defaultCategoryOverrides).toEqual({});
    expect(useAppStore.getState().translationEngine).toBe('microsoft');
  });
});
