import { describe, expect, it } from 'vitest';
import { evaluateAssetFilter, normalizeAssetFilters, normalizeMatchedLinkName } from './assetFilters';
import type { AssetFilter } from '../types';

const names = ['app-linux.zip', 'app-linux-debug.zip', 'source code (v1)', 'windows download'];
const realAssets = names.slice(0, 2);
describe('asset filter rules', () => {
  it.each<{ title: string; rules: Partial<AssetFilter>; matches: boolean; indexes: number[] }>([
    { title: 'positive words', rules: { keywords: ['LINUX'] }, matches: true, indexes: [0, 1] },
    { title: 'blacklist wins', rules: { keywords: ['linux'], excludeKeywords: ['debug'] }, matches: true, indexes: [0] },
    { title: 'blacklist only uses real assets for release matching', rules: { excludeKeywords: ['linux'] }, matches: false, indexes: [] },
    { title: 'blacklist only displays every surviving link', rules: { excludeKeywords: ['debug'] }, matches: true, indexes: [0, 2, 3] },
    { title: 'source preset keeps generated archives', rules: { keywords: ['source'] }, matches: true, indexes: [2] },
    { title: 'body download links match positive rules', rules: { keywords: ['windows'] }, matches: true, indexes: [3] },
    { title: 'include repositories bypasses keyword blacklist', rules: { keywords: ['missing'], excludeKeywords: ['linux'], includeRepos: ['Owner/App'] }, matches: true, indexes: [0, 1, 2, 3] },
    { title: 'exclude repository wins over include', rules: { includeRepos: ['Owner/App'], alwaysExcludeRepos: ['OWNER/APP'] }, matches: false, indexes: [] },
    { title: 'exclude is local to this filter', rules: { keywords: ['linux'], alwaysExcludeRepos: ['owner/app'] }, matches: false, indexes: [] },
    { title: 'include-only filter excludes other repositories', rules: { includeRepos: ['owner/other'] }, matches: false, indexes: [] },
    { title: 'exclude-only filter accepts other repositories', rules: { alwaysExcludeRepos: ['owner/other'] }, matches: true, indexes: [0, 1, 2, 3] },
    { title: 'no rules cannot unlock all links', rules: {}, matches: false, indexes: [] },
    { title: 'empty words cannot unlock all links', rules: { keywords: ['', ' '], excludeKeywords: [''] }, matches: false, indexes: [] },
    { title: 'words are trimmed before matching', rules: { keywords: [' linux '], excludeKeywords: [' debug '] }, matches: true, indexes: [0] },
  ])('$title', ({ rules, matches, indexes }) => {
    const evaluation = evaluateAssetFilter({ keywords: [], ...rules }, 'owner/app', names, realAssets);
    expect(evaluation.matchesRelease).toBe(matches);
    expect([...evaluation.matchedLinkIndexes]).toEqual(indexes);
  });

  it('allows include-only filters to display releases without any assets or archive links', () => {
    expect(evaluateAssetFilter({ keywords: [], includeRepos: ['owner/app'] }, 'owner/app', [], [])).toEqual({ matchesRelease: true, matchedLinkIndexes: new Set() });
  });

  it('does not interpret the retired reverse repository rule as always-exclude', () => {
    const filters = normalizeAssetFilters([{ id: 'old', name: 'Old', keywords: ['linux'], excludeRepos: ['owner/app'] }]);
    expect(evaluateAssetFilter(filters[0], 'owner/app', names, realAssets).matchesRelease).toBe(true);
    expect(filters[0]).not.toHaveProperty('excludeRepos');
  });

  it.each(['Source code (v1.zip)', 'Source code (v1.tar.gz)'])('removes generated archive suffixes from %s', (name) => {
    expect(normalizeMatchedLinkName(name.toLowerCase(), true)).toBe('source code (v1)');
    expect(normalizeMatchedLinkName(name.toLowerCase(), false)).toBe(name.toLowerCase());
  });
});
