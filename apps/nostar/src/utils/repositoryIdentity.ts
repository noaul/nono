import type { Repository } from '../types';

/**
 * The single rule for "is this the same repository": the GitHub `id` is authoritative and
 * `full_name` is only a fallback for records that never had a real id.
 *
 * Early batch-star builds stored new repositories under a synthetic `Date.now() + random` id
 * (around 1.8e12). Real GitHub repository ids are far below 1e11, so the floor separates them.
 * Only those synthetic records may be claimed by name: a record with a real id that no longer
 * matches has been renamed or deleted, and claiming it by name would hand its AI analysis and
 * categories to an unrelated repository that reused the old name.
 */
export const SYNTHETIC_REPOSITORY_ID_FLOOR = 1e11;

export type RepositoryIdentity = Pick<Repository, 'id' | 'full_name'>;

export const isValidGitHubRepositoryId = (id: unknown): id is number =>
  typeof id === 'number' && Number.isInteger(id) && id > 0 && id < SYNTHETIC_REPOSITORY_ID_FLOOR;

export const isLegacySyntheticIdRecord = (repo: Pick<Repository, 'id'>): boolean =>
  repo.id >= SYNTHETIC_REPOSITORY_ID_FLOOR;

export const matchesSameGitHubId = (incoming: RepositoryIdentity, candidate: RepositoryIdentity): boolean =>
  isValidGitHubRepositoryId(incoming.id) && candidate.id === incoming.id;

/** GitHub owner/repo names are case-insensitive, so the fallback is too. */
export const matchesLegacyNameFallback = (incoming: RepositoryIdentity, candidate: RepositoryIdentity): boolean =>
  Boolean(incoming.full_name)
  && Boolean(candidate.full_name)
  && isLegacySyntheticIdRecord(candidate)
  && candidate.full_name.toLowerCase() === incoming.full_name.toLowerCase();

/** Local record for one incoming repository: id first, then the legacy name fallback. */
export const findIdentityMatch = <T extends RepositoryIdentity>(incoming: RepositoryIdentity, candidates: T[]): T | undefined =>
  candidates.find(candidate => matchesSameGitHubId(incoming, candidate))
  ?? candidates.find(candidate => matchesLegacyNameFallback(incoming, candidate));

/**
 * Local records for a whole batch, aligned with `incoming` (`undefined` means new).
 *
 * Two passes, one record per incoming entry: GitHub lets a new repository take the name another
 * one just gave up. With local `{ id: 1, 'o/old' }` and a batch holding both the renamed
 * `{ id: 1, 'o/new' }` and a new `{ id: 2, 'o/old' }`, a single pass could hand the same local
 * record to both. Ids claim their records first, then the fallback only sees what is left.
 */
export const assignIdentityMatches = <T extends RepositoryIdentity>(
  incoming: RepositoryIdentity[],
  candidates: T[],
): Array<T | undefined> => {
  const assignments: Array<T | undefined> = new Array(incoming.length).fill(undefined);
  if (!incoming.length || !candidates.length) return assignments;
  const claimed = new Set<T>();
  const byId = new Map<number, T>();
  for (const candidate of candidates) if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);

  incoming.forEach((repo, index) => {
    if (!isValidGitHubRepositoryId(repo.id)) return;
    const match = byId.get(repo.id);
    if (!match || claimed.has(match)) return;
    assignments[index] = match;
    claimed.add(match);
  });
  incoming.forEach((repo, index) => {
    if (assignments[index]) return;
    if (incoming.some(other => other.id !== repo.id && other.full_name.toLowerCase() === repo.full_name.toLowerCase())) return;
    const match = candidates.find(candidate => !claimed.has(candidate) && matchesLegacyNameFallback(repo, candidate));
    if (!match) return;
    assignments[index] = match;
    claimed.add(match);
  });
  return assignments;
};

/** Synthetic id for a repository without a usable GitHub id that does not collide with local ones. */
export const generateFallbackRepositoryId = (existing: Pick<Repository, 'id'>[]): number => {
  const maxExistingId = existing.reduce((max, repo) => Math.max(max, repo.id), 0);
  return Math.max(Date.now(), SYNTHETIC_REPOSITORY_ID_FLOOR, maxExistingId + 1) + Math.floor(Math.random() * 10000);
};

/** Restore references after the selected repositories have been normalized by the store. */
export function canonicalizeImportedRepositoryReferences<T extends {
  repositories?: RepositoryIdentity[];
  releases?: Array<{ repository: { id: number; full_name: string; name: string } }>;
  releaseSubscriptions?: number[];
}>(data: T, canonical: RepositoryIdentity[]): T {
  const remaps = new Map<number, number>();
  for (const legacy of [...(data.repositories ?? []), ...(data.releases ?? []).map(release => release.repository)]) {
    if (!isLegacySyntheticIdRecord(legacy)) continue;
    const matches = canonical.filter(repo => isValidGitHubRepositoryId(repo.id) && repo.full_name.toLowerCase() === legacy.full_name.toLowerCase());
    if (new Set(matches.map(repo => repo.id)).size === 1) remaps.set(legacy.id, matches[0].id);
  }
  return {
    ...data,
    releases: data.releases?.map(release => ({ ...release, repository: { ...release.repository, id: remaps.get(release.repository.id) ?? release.repository.id } })),
    releaseSubscriptions: data.releaseSubscriptions?.map(id => remaps.get(id) ?? id),
  };
}
