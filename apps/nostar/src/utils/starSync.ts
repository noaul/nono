import type { Repository } from '../types';
import { assignIdentityMatches, isLegacySyntheticIdRecord, isValidGitHubRepositoryId } from './repositoryIdentity';

export interface StarredSnapshot {
  repositories: Repository[];
  complete: boolean;
}

export interface StarSyncResult {
  repositories: Repository[];
  newRepoCount: number;
  /** Local repositories missing from the snapshot that were kept because it looked incomplete. */
  keptMissingCount: number;
  /** Stale synthetic-id twins folded into their real-id record, for remapping id-keyed state. */
  foldedIds: Array<{ from: number; to: number }>;
}

// How many "no longer starred" repositories are re-checked one by one before trusting the snapshot.
const MAX_MISSING_CHECKS = 20;

// Local-only fields a stale synthetic-id duplicate may still hold for its real-id twin.
const LOCAL_FIELDS = [
  'ai_summary', 'ai_tags', 'ai_platforms', 'analyzed_at', 'analysis_failed', 'analysis_error',
  'custom_description', 'custom_tags', 'custom_category', 'category_locked', 'last_edited',
] as const satisfies ReadonlyArray<keyof Repository>;

const isEmpty = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * Earlier builds could end up with both a synthetic-id record from a batch star and a real-id record
 * for the same repository. Fold the stale twin into the synced one instead of keeping both: the
 * twin usually carries the AI analysis the user cares about. Distinct real ids stay separate even
 * when a repository name has been reused.
 */
export function foldSyntheticDuplicates(merged: Repository[], unclaimed: Repository[]) {
  const byName = new Map(merged.flatMap((repo, index) => isValidGitHubRepositoryId(repo.id) ? [[repo.full_name.toLowerCase(), index] as const] : []));
  for (const [name, index] of byName) {
    if (merged.some(repo => isValidGitHubRepositoryId(repo.id) && repo.id !== merged[index].id && repo.full_name.toLowerCase() === name)) byName.delete(name);
  }
  const folded = new Set<Repository>();
  const foldedIds: Array<{ from: number; to: number }> = [];
  const result = [...merged];
  for (const stale of unclaimed) {
    if (!isLegacySyntheticIdRecord(stale) || !stale.full_name) continue;
    const index = byName.get(stale.full_name.toLowerCase());
    if (index === undefined) continue;
    if (!isValidGitHubRepositoryId(result[index].id)) continue;
    const target = { ...result[index] } as Record<string, unknown>;
    if (isEmpty(target.custom_category) && !isEmpty(stale.custom_category)) target.category_locked = stale.category_locked;
    for (const field of LOCAL_FIELDS) {
      if (isEmpty(target[field]) && !isEmpty(stale[field])) target[field] = stale[field];
    }
    if (stale.subscribed_to_releases && !target.subscribed_to_releases) target.subscribed_to_releases = true;
    result[index] = target as unknown as Repository;
    folded.add(stale);
    foldedIds.push({ from: stale.id, to: result[index].id });
  }
  return { repositories: result, folded, foldedIds };
}

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
  // Same matching as addRepository: GitHub id first (renames update in place), and only legacy
  // synthetic-id records from early batch stars may be claimed by name. A claimed record keeps its
  // real id; the store remaps releases and subscriptions in the same update.
  const assignments = assignIdentityMatches(snapshot.repositories, localRepositories);
  const claimed = new Set(assignments.filter((match): match is Repository => match !== undefined));

  const merged = snapshot.repositories.map((newRepo, index) => {
    const existing = assignments[index];
    if (existing) {
      return {
        ...existing,
        id: newRepo.id,
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
        // GitHub sends `license: null` for unlicensed repositories; only a missing field keeps the old value.
        license: newRepo.license !== undefined ? newRepo.license : existing.license,
      };
    }
    return newRepo;
  });
  const newRepoCount = assignments.filter(match => match === undefined).length;

  const folding = foldSyntheticDuplicates(merged, localRepositories.filter(repo => !claimed.has(repo)));
  assignments.forEach((existing, index) => {
    if (existing && existing.id !== merged[index].id) folding.foldedIds.push({ from: existing.id, to: merged[index].id });
  });
  const missing = localRepositories.filter(repo => !claimed.has(repo) && !folding.folded.has(repo));
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
    return { repositories: folding.repositories, newRepoCount, keptMissingCount: 0, foldedIds: folding.foldedIds };
  }
  return { repositories: [...folding.repositories, ...missing], newRepoCount, keptMissingCount: missing.length, foldedIds: folding.foldedIds };
}
