import { afterEach, describe, expect, it, vi } from 'vitest';
import { backend } from './backendAdapter';
import { syncFromBackend } from './autoSync';

const fixtures = vi.hoisted(() => {
  const aiConfig = {
    id: 'ai-local',
    name: 'Local AI',
    apiType: 'openai' as const,
    baseUrl: 'https://ai.example/v1',
    apiKey: 'ai-secret',
    model: 'model',
    isActive: true,
  };
  const webdavConfig = {
    id: 'dav-local',
    name: 'Local WebDAV',
    url: 'https://dav.example',
    username: 'user',
    password: 'dav-secret',
    path: '/backup',
    isActive: true,
  };
  const embeddingConfig = {
    id: 'embedding-local',
    name: 'Local Embedding',
    apiType: 'openai-compatible' as const,
    baseUrl: 'https://embedding.example/v1',
    apiKey: 'embedding-secret',
    model: 'embedding-model',
    dimensions: 1024,
    isActive: true,
  };
  const vectorSearchConfig = { enabled: false, authToken: '' };
  const state = {
    repositories: [] as unknown[],
    releases: [] as unknown[],
    aiConfigs: [aiConfig],
    webdavConfigs: [webdavConfig],
    embeddingConfigs: [embeddingConfig],
    vectorSearchConfig,
    activeAIConfig: aiConfig.id,
    activeWebDAVConfig: webdavConfig.id,
    activeEmbeddingConfig: embeddingConfig.id,
    hiddenDefaultCategoryIds: [],
    categoryOrder: [],
    customCategories: [],
    assetFilters: [],
    releaseSourceSettings: {},
    collapsedSidebarCategoryCount: 8,
    setRepositories(value: unknown[]) { state.repositories = value; },
    setReleases(value: unknown[]) { state.releases = value; },
    setAIConfigs(value: Array<typeof aiConfig>) { state.aiConfigs = value; },
    setWebDAVConfigs(value: Array<typeof webdavConfig>) { state.webdavConfigs = value; },
    setEmbeddingConfigs(value: Array<typeof embeddingConfig>) { state.embeddingConfigs = value; },
    setVectorSearchConfig(value: typeof vectorSearchConfig) { state.vectorSearchConfig = value; },
    setActiveAIConfig(value: string | null) { state.activeAIConfig = value ?? ''; },
    setActiveWebDAVConfig(value: string | null) { state.activeWebDAVConfig = value ?? ''; },
    setActiveEmbeddingConfig(value: string | null) { state.activeEmbeddingConfig = value ?? ''; },
    showDefaultCategory: vi.fn(),
    hideDefaultCategory: vi.fn(),
  };
  const useAppStore = Object.assign(vi.fn(), {
    getState: () => state,
    setState: (updates: Partial<typeof state>) => Object.assign(state, updates),
  });
  return { aiConfig, webdavConfig, embeddingConfig, state, useAppStore };
});

vi.mock('../store/useAppStore', () => ({ useAppStore: fixtures.useAppStore }));

describe('autoSync configuration bootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves local secret configs and pushes them when the backend is initially empty', async () => {
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
    vi.spyOn(backend, 'fetchRepositories').mockResolvedValue({ repositories: [], total: 0 });
    vi.spyOn(backend, 'fetchReleases').mockResolvedValue({ releases: [], total: 0 });
    vi.spyOn(backend, 'fetchAIConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchWebDAVConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchEmbeddingConfigs').mockResolvedValue([]);
    vi.spyOn(backend, 'fetchVectorSearchConfig').mockResolvedValue(fixtures.state.vectorSearchConfig as never);
    vi.spyOn(backend, 'fetchSettings').mockResolvedValue({});
    vi.spyOn(backend, 'syncRepositories').mockResolvedValue();
    vi.spyOn(backend, 'syncReleases').mockResolvedValue();
    const syncAI = vi.spyOn(backend, 'syncAIConfigs').mockResolvedValue();
    const syncWebDAV = vi.spyOn(backend, 'syncWebDAVConfigs').mockResolvedValue();
    const syncEmbedding = vi.spyOn(backend, 'syncEmbeddingConfigs').mockResolvedValue();
    vi.spyOn(backend, 'syncVectorSearchConfig').mockResolvedValue();
    vi.spyOn(backend, 'syncSettings').mockResolvedValue();

    await syncFromBackend();

    expect(fixtures.state.aiConfigs).toEqual([fixtures.aiConfig]);
    expect(fixtures.state.webdavConfigs).toEqual([fixtures.webdavConfig]);
    expect(fixtures.state.embeddingConfigs).toEqual([fixtures.embeddingConfig]);
    await vi.waitFor(() => {
      expect(syncAI).toHaveBeenCalledWith([fixtures.aiConfig]);
      expect(syncWebDAV).toHaveBeenCalledWith([fixtures.webdavConfig]);
      expect(syncEmbedding).toHaveBeenCalledWith([fixtures.embeddingConfig]);
    });
  });
});
