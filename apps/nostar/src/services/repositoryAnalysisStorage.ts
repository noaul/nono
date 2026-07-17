import type { Repository } from '../types';

interface RepositoryAnalysisSnapshot {
  id: number;
  full_name: string;
  ai_summary: string | null;
  ai_tags: string[];
  ai_platforms: string[];
  analyzed_at: string | null;
  analysis_failed: boolean | null;
  analysis_error: string | null;
  custom_category: string | null;
  category_locked: boolean | null;
  updated_at: string;
}

const KEY_PREFIX = 'github-stars-manager-repo-analysis:';

const getSnapshotKey = (repoId: number): string => `${KEY_PREFIX}${repoId}`;

const canUseLocalStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const hasRestorableData = (repo: Repository): boolean =>
  !!repo.ai_summary ||
  (Array.isArray(repo.ai_tags) && repo.ai_tags.length > 0) ||
  (Array.isArray(repo.ai_platforms) && repo.ai_platforms.length > 0) ||
  !!repo.analyzed_at ||
  repo.analysis_failed === true ||
  !!repo.analysis_error ||
  repo.custom_category !== undefined ||
  repo.category_locked === true;

const createSnapshot = (repo: Repository): RepositoryAnalysisSnapshot => ({
  id: repo.id,
  full_name: repo.full_name,
  ai_summary: repo.ai_summary ?? null,
  ai_tags: Array.isArray(repo.ai_tags) ? repo.ai_tags : [],
  ai_platforms: Array.isArray(repo.ai_platforms) ? repo.ai_platforms : [],
  analyzed_at: repo.analyzed_at ?? null,
  analysis_failed: repo.analysis_failed ?? null,
  analysis_error: repo.analysis_error ?? null,
  custom_category: repo.custom_category ?? null,
  category_locked: repo.category_locked ?? null,
  updated_at: new Date().toISOString(),
});

export const saveRepositoryAnalysisSnapshot = async (repo: Repository): Promise<void> => {
  if (!canUseLocalStorage()) return;

  const key = getSnapshotKey(repo.id);
  try {
    if (!hasRestorableData(repo)) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(createSnapshot(repo)));
  } catch (error) {
    console.warn('[repositoryAnalysisStorage] save snapshot failed:', error);
  }
};

const loadSnapshotsFromLocalStorage = (): Map<number, RepositoryAnalysisSnapshot> => {
  const snapshots = new Map<number, RepositoryAnalysisSnapshot>();
  if (!canUseLocalStorage()) return snapshots;

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const snapshot = JSON.parse(raw) as RepositoryAnalysisSnapshot;
      if (typeof snapshot.id === 'number' && typeof snapshot.full_name === 'string') {
        snapshots.set(snapshot.id, snapshot);
      }
    }
  } catch (error) {
    console.warn('[repositoryAnalysisStorage] load snapshots failed:', error);
  }

  return snapshots;
};

const mergeSnapshot = (repo: Repository, snapshot: RepositoryAnalysisSnapshot): Repository => {
  if (snapshot.full_name !== repo.full_name) return repo;
  const shouldRestoreCategory = repo.custom_category == null && snapshot.custom_category != null;

  return {
    ...repo,
    ai_summary: repo.ai_summary || snapshot.ai_summary || undefined,
    ai_tags: Array.isArray(repo.ai_tags) && repo.ai_tags.length > 0 ? repo.ai_tags : snapshot.ai_tags,
    ai_platforms: Array.isArray(repo.ai_platforms) && repo.ai_platforms.length > 0 ? repo.ai_platforms : snapshot.ai_platforms,
    analyzed_at: repo.analyzed_at || snapshot.analyzed_at || undefined,
    analysis_failed: repo.analysis_failed ?? snapshot.analysis_failed ?? undefined,
    analysis_error: repo.analysis_error ?? snapshot.analysis_error ?? undefined,
    custom_category: repo.custom_category ?? snapshot.custom_category ?? undefined,
    category_locked: shouldRestoreCategory
      ? snapshot.category_locked ?? undefined
      : repo.category_locked ?? snapshot.category_locked ?? undefined,
  };
};

export const mergeRepositoryAnalysisSnapshotsSync = (repositories: Repository[]): Repository[] => {
  const snapshots = loadSnapshotsFromLocalStorage();
  if (snapshots.size === 0) return repositories;

  return repositories.map((repo) => {
    const snapshot = snapshots.get(repo.id);
    return snapshot ? mergeSnapshot(repo, snapshot) : repo;
  });
};

export const mergeRepositoryAnalysisSnapshots = async (repositories: Repository[]): Promise<Repository[]> =>
  mergeRepositoryAnalysisSnapshotsSync(repositories);
