import type { Repository } from '../types';

export interface StarredSnapshot {
  repositories: Repository[];
  complete: boolean;
}

export interface StarSyncResult {
  repositories: Repository[];
  newRepoCount: number;
  /** Local repositories missing from the snapshot that were kept because it looked incomplete. */
  keptMissingCount: number;
}

// How many "no longer starred" repositories are re-checked one by one before trusting the snapshot.
const MAX_MISSING_CHECKS = 20;

/**
 * Merge a fresh starred-list snapshot into the local repositories. Repositories missing from the
 * snapshot are only dropped when the snapshot looks complete: offset paging can skip an entry when
 * the list shifts (e.g. an unstar mid-sync), and dropping it would lose its custom metadata.
 */
export async function reconcileStarredRepositories(
  snapshot: StarredSnapshot,
  localRepositories: Repository[],
  isStillStarred: (repo: Repository) => Promise<boolean>,
): Promise<StarSyncResult> {
  const existingRepoMap = new Map(localRepositories.map(repo => [repo.id, repo]));
  const fetchedIds = new Set(snapshot.repositories.map(repo => repo.id));

  const merged = snapshot.repositories.map(newRepo => {
    const existing = existingRepoMap.get(newRepo.id);
    if (existing) {
      return {
        ...existing,
        name: newRepo.name,
        full_name: newRepo.full_name,
        description: newRepo.description,
        html_url: newRepo.html_url,
        stargazers_count: newRepo.stargazers_count,
        forks_count: newRepo.forks_count,
        forks: newRepo.forks,
        language: newRepo.language,
        updated_at: newRepo.updated_at,
        pushed_at: newRepo.pushed_at,
        starred_at: newRepo.starred_at,
        owner: newRepo.owner,
        topics: newRepo.topics,
      };
    }
    return newRepo;
  });
  const newRepoCount = snapshot.repositories.filter(repo => !existingRepoMap.has(repo.id)).length;

  const missing = localRepositories.filter(repo => !fetchedIds.has(repo.id));
  let authoritative = snapshot.complete;
  if (authoritative && missing.length > 0) {
    try {
      for (const repo of missing.slice(0, MAX_MISSING_CHECKS)) {
        if (await isStillStarred(repo)) {
          authoritative = false;
          break;
        }
      }
    } catch {
      authoritative = false;
    }
  }

  if (authoritative || missing.length === 0) {
    return { repositories: merged, newRepoCount, keptMissingCount: 0 };
  }
  return { repositories: [...merged, ...missing], newRepoCount, keptMissingCount: missing.length };
}
