import type { AssetFilter } from '../types';
import { normalizeRepoKey } from './releaseSources';

const sanitizeStrings = (value: unknown, key = (item: string) => item.toLowerCase()): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (typeof item !== 'string' || !item.trim()) return [];
    const trimmed = item.trim();
    const normalized = key(trimmed);
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [trimmed];
  });
};

/** Keep old keyword-only filters; discard malformed and retired fields on import. */
export function normalizeAssetFilters(value: unknown): AssetFilter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(filter => {
    if (!filter || typeof filter !== 'object' || typeof filter.id !== 'string' || !filter.id.trim()
      || typeof filter.name !== 'string' || !Array.isArray(filter.keywords)) return [];
    const normalized: AssetFilter = { id: filter.id, name: filter.name, keywords: sanitizeStrings(filter.keywords)! };
    const excludeKeywords = sanitizeStrings(filter.excludeKeywords);
    const includeRepos = sanitizeStrings(filter.includeRepos, normalizeRepoKey);
    const alwaysExcludeRepos = sanitizeStrings(filter.alwaysExcludeRepos, normalizeRepoKey);
    if (excludeKeywords) normalized.excludeKeywords = excludeKeywords;
    if (includeRepos) normalized.includeRepos = includeRepos;
    if (alwaysExcludeRepos) normalized.alwaysExcludeRepos = alwaysExcludeRepos;
    if (typeof filter.isPreset === 'boolean') normalized.isPreset = filter.isPreset;
    if (typeof filter.icon === 'string') normalized.icon = filter.icon;
    return [normalized];
  });
}

/** Generated archives may match "source", but their universal suffixes cannot match every release. */
export const normalizeMatchedLinkName = (lowerName: string, isSourceCode: boolean): string =>
  isSourceCode ? lowerName.replace(/\.(?:zip|tar\.gz)(?=\)$)/, '') : lowerName;

export interface AssetFilterEvaluation {
  matchesRelease: boolean;
  matchedLinkIndexes: Set<number>;
}

/** Evaluate both visibility and links together. Selected filters combine by OR and link union. */
export function evaluateAssetFilter(
  filter: Pick<AssetFilter, 'keywords'> & Partial<AssetFilter>,
  repoKey: string,
  linkNames: readonly string[],
  realAssetNames: readonly string[],
): AssetFilterEvaluation {
  const noMatch = (): AssetFilterEvaluation => ({ matchesRelease: false, matchedLinkIndexes: new Set() });
  const allLinks = (): AssetFilterEvaluation => ({ matchesRelease: true, matchedLinkIndexes: new Set(linkNames.map((_, index) => index)) });
  const normalizedRepo = normalizeRepoKey(repoKey);
  if ((filter.alwaysExcludeRepos ?? []).some(repo => normalizeRepoKey(repo) === normalizedRepo)) return noMatch();
  if ((filter.includeRepos ?? []).some(repo => normalizeRepoKey(repo) === normalizedRepo)) return allLinks();

  const keywords = sanitizeStrings(filter.keywords) ?? [];
  const excluded = sanitizeStrings(filter.excludeKeywords) ?? [];
  if (keywords.length === 0 && excluded.length === 0) {
    return (filter.includeRepos ?? []).length === 0 && (filter.alwaysExcludeRepos ?? []).length > 0 ? allLinks() : noMatch();
  }
  const hits = (name: string): boolean => !excluded.some(word => name.includes(word.toLowerCase()))
    && (keywords.length === 0 || keywords.some(word => name.includes(word.toLowerCase())));
  // Blacklist-only filters require a surviving real asset; automatic archives cannot revive excluded releases.
  if (!(keywords.length > 0 ? linkNames : realAssetNames).some(hits)) return noMatch();
  return {
    matchesRelease: true,
    matchedLinkIndexes: new Set(linkNames.flatMap((name, index) => hits(name) ? [index] : [])),
  };
}
