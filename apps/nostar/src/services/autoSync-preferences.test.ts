import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.unmock('../store/useAppStore');
import { useAppStore } from '../store/useAppStore';
import { backend } from './backendAdapter';
import { syncFromBackend, syncToBackend, stopAutoSync } from './autoSync';
import { createRelease } from '../test/releaseFixtures';

describe('Release and translation settings sync', () => {
  beforeEach(() => {
    stopAutoSync(() => {});
    useAppStore.setState({repositories: [], releases: [createRelease({id: 47, is_read: false})], readReleases: new Set([47]), releaseSubscriptions: new Set([10]), aiConfigs: [], webdavConfigs: [], embeddingConfigs: [], displayPreferences: {fontSize:'large',reducedMotion:true,cardFields:{description:false,tags:true,language:true,stars:true,license:true,updated:true}}, categoryListIdMap:{cat:'LIST'},githubListMemberships:{cat:['owner/repo']}, translationEngine: 'google', defaultCategoryOverrides: {tools: {name: 'Custom tools'}}});
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
    expect(backend.syncSettings).toHaveBeenCalledWith(expect.objectContaining({displayPreferences: expect.objectContaining({fontSize:'large',reducedMotion:true}),categoryListIdMap:{cat:'LIST'},githubListMemberships:{cat:['owner/repo']},translationEngine: 'google', releaseSubscriptions: [10], defaultCategoryOverrides: {tools: {name: 'Custom tools'}}}));
  });
  it('adopts remote read flags and preferences including explicit empty subscriptions', async () => {
    vi.spyOn(backend, 'fetchRepositories').mockResolvedValue({repositories: [], total: 0});
    vi.spyOn(backend, 'fetchReleases').mockResolvedValue({releases: [createRelease({id: 92, is_read: true})], total: 1});
    vi.spyOn(backend, 'fetchAIConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchWebDAVConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchEmbeddingConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchVectorSearchConfig').mockResolvedValue(useAppStore.getState().vectorSearchConfig);
    vi.spyOn(backend, 'fetchSettings').mockResolvedValue({displayPreferences:{fontSize:'small'},categoryListIdMap:{},githubListMemberships:{},translationEngine: 'microsoft', releaseSubscriptions: [], defaultCategoryOverrides: {}});
    await syncFromBackend();
    expect([...useAppStore.getState().readReleases]).toEqual([92]);
    expect([...useAppStore.getState().releaseSubscriptions]).toEqual([]);
    expect(useAppStore.getState().defaultCategoryOverrides).toEqual({});
    expect(useAppStore.getState().translationEngine).toBe('microsoft');
    expect(useAppStore.getState().displayPreferences.fontSize).toBe('small');
    expect(useAppStore.getState().categoryListIdMap).toEqual({});
    expect(useAppStore.getState().githubListMemberships).toEqual({});
  });
  it('merges device-local reads on the first pull and pushes them, then trusts the backend', async () => {
    useAppStore.setState({readReleases: new Set([47, 99])});
    vi.spyOn(backend, 'fetchRepositories').mockResolvedValue({repositories: [], total: 0});
    const fetchReleases = vi.spyOn(backend, 'fetchReleases').mockResolvedValue({releases: [createRelease({id: 47, is_read: false}), createRelease({id: 92, is_read: true})], total: 2});
    vi.spyOn(backend, 'fetchAIConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchWebDAVConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchEmbeddingConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchVectorSearchConfig').mockResolvedValue(useAppStore.getState().vectorSearchConfig);
    vi.spyOn(backend, 'fetchSettings').mockResolvedValue({});
    await syncFromBackend();
    expect([...useAppStore.getState().readReleases].sort()).toEqual([47, 92]);
    await vi.waitFor(() => expect(backend.syncReleases).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({id: 47, is_read: true})])));

    fetchReleases.mockResolvedValue({releases: [createRelease({id: 47, is_read: false}), createRelease({id: 92, is_read: false})], total: 2});
    // The merge push may still be in flight; pulls are skipped until it settles.
    await vi.waitFor(async () => {
      await syncFromBackend();
      expect([...useAppStore.getState().readReleases]).toEqual([]);
    });
  });
});
