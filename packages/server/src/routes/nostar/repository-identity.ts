import { type AnyRecord, repositoryData, requiredBigInt, toLegacyRepository } from './common.js';

const SYNTHETIC_FLOOR = 100_000_000_000n;
export const REPOSITORY_IDENTITY_ALIASES_KEY = 'repositoryIdentityAliases';

export async function loadRepositoryAliases(tx: AnyRecord, userId: number): Promise<Map<bigint, bigint>> {
  const setting = await tx.noStarSetting.findUnique({ where: { userId_key: { userId, key: REPOSITORY_IDENTITY_ALIASES_KEY } } });
  const aliases = new Map<bigint, bigint>();
  for (const [from, to] of Object.entries(setting?.value ?? {})) {
    try {
      const source = BigInt(from), target = BigInt(String(to));
      if (source >= SYNTHETIC_FLOOR && target > 0n && target < SYNTHETIC_FLOOR) aliases.set(source, target);
    } catch { /* Ignore malformed legacy settings. */ }
  }
  return aliases;
}
const key = (repo: AnyRecord) => String(repo.full_name ?? repo.fullName ?? '').toLowerCase();
const id = (repo: AnyRecord) => requiredBigInt(repo.githubId ?? repo.id, 'repository id');
const empty = (value: unknown) => value == null || value === '' || (Array.isArray(value) && !value.length);
const localFields = ['ai_summary', 'ai_tags', 'ai_platforms', 'analyzed_at', 'analysis_failed', 'analysis_error',
  'custom_description', 'custom_tags', 'custom_category', 'category_locked', 'last_edited', 'subscribed_to_releases'];

function fillLocalFields(target: AnyRecord, source: AnyRecord) {
  const result = { ...target };
  if (empty(target.custom_category) && !empty(source.custom_category)) result.category_locked = source.category_locked;
  for (const field of localFields) if (empty(result[field]) && !empty(source[field])) result[field] = source[field];
  if (source.subscribed_to_releases) result.subscribed_to_releases = true;
  return result;
}

/** Only timestamp-id legacy rows can be claimed by name. Never merge distinct real ids. */
export async function reconcileRepositoryIdentities(tx: AnyRecord, userId: number, incoming: AnyRecord[], baseline: AnyRecord[] | null) {
  const rows: AnyRecord[] = await tx.noStarRepository.findMany({ where: { userId } });
  const canonical = [...rows.map(toLegacyRepository), ...incoming].filter(repo => id(repo) < SYNTHETIC_FLOOR);
  const canonicalByName = new Map<string, Set<bigint>>();
  for (const repo of canonical) {
    if (!key(repo)) continue;
    const ids = canonicalByName.get(key(repo)) ?? new Set<bigint>();
    ids.add(id(repo));
    canonicalByName.set(key(repo), ids);
  }
  const remaps = await loadRepositoryAliases(tx, userId);
  const previousAliasCount = remaps.size;
  for (const repo of [...rows, ...incoming, ...(baseline ?? [])]) {
    if (id(repo) < SYNTHETIC_FLOOR || remaps.has(id(repo))) continue;
    const ids = canonicalByName.get(key(repo));
    // A reused name with multiple real identities is ambiguous; retain the legacy record.
    if (ids?.size === 1) remaps.set(id(repo), [...ids][0]);
  }
  for (const row of [...rows]) {
    const targetId = remaps.get(id(row));
    if (targetId === undefined) continue;
    const target = rows.find(candidate => id(candidate) === targetId);
    if (target) {
      const merged = fillLocalFields(toLegacyRepository(target), toLegacyRepository(row));
      // Move the relation first: deleting a repository otherwise cascades its releases.
      await tx.noStarRelease.updateMany({ where: { userId, repositoryId: row.id }, data: { repositoryId: target.id } });
      Object.assign(target, await tx.noStarRepository.update({ where: { id: target.id }, data: repositoryData(merged) }));
      await tx.noStarRepository.deleteMany({ where: { userId, id: row.id } });
      rows.splice(rows.indexOf(row), 1);
    } else {
      Object.assign(row, await tx.noStarRepository.update({ where: { id: row.id }, data: { githubId: targetId } }));
    }
  }
  if (remaps.size !== previousAliasCount) {
    const value = Object.fromEntries([...remaps].map(([from, to]) => [String(from), Number(to)]));
    await tx.noStarSetting.upsert({ where: { userId_key: { userId, key: REPOSITORY_IDENTITY_ALIASES_KEY } }, update: { value }, create: { userId, key: REPOSITORY_IDENTITY_ALIASES_KEY, value } });
    const subscriptions = await tx.noStarSetting.findUnique({ where: { userId_key: { userId, key: 'releaseSubscriptions' } } });
    if (Array.isArray(subscriptions?.value)) {
      const value = [...new Set(subscriptions.value.filter(Number.isSafeInteger).map((value: number) => Number(remaps.get(BigInt(value)) ?? BigInt(value))))];
      await tx.noStarSetting.upsert({ where: { userId_key: { userId, key: 'releaseSubscriptions' } }, update: { value }, create: { userId, key: 'releaseSubscriptions', value } });
    }
  }
  const normalize = (repos: AnyRecord[]) => {
    const byId = new Map<bigint, AnyRecord>();
    // Canonical data wins; legacy local values fill only empty fields.
    for (const repo of [...repos].sort((a, b) => Number(id(a) >= SYNTHETIC_FLOOR) - Number(id(b) >= SYNTHETIC_FLOOR))) {
      const canonicalId = remaps.get(id(repo)) ?? id(repo);
      const current = rows.find(row => id(row) === canonicalId);
      // Stale synthetic input can contain an old name after the canonical repository was renamed.
      const normalized = current && baseline === null
        ? id(repo) !== canonicalId ? fillLocalFields(toLegacyRepository(current), repo)
          : [...remaps.values()].includes(canonicalId) ? fillLocalFields(repo, toLegacyRepository(current)) : repo
        : repo;
      const value = { ...normalized, ...(id(repo) !== canonicalId && current ? { full_name: current.fullName, name: current.name, html_url: current.htmlUrl } : {}), id: Number(canonicalId) };
      const previous = byId.get(canonicalId);
      byId.set(canonicalId, previous ? fillLocalFields(previous, value) : value);
    }
    return [...byId.values()];
  };
  return { rows, repositories: normalize(incoming), baseline: baseline ? normalize(baseline) : null, remaps };
}
