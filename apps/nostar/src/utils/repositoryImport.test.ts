import { describe, expect, it } from 'vitest';
import { extractRepositoryCandidates } from './repositoryImport';

describe('batch repository intake', () => {
  it('extracts Markdown and GitHub subpaths in input order and deduplicates case-insensitively', () => {
    const result = extractRepositoryCandidates('vercel/next.js [React](https://github.com/Facebook/React/tree/main) github.com/vercel/next.js.git **microsoft/typescript**');
    expect(result.fullNames).toEqual(['vercel/next.js', 'Facebook/React', 'microsoft/typescript']);
    expect(result.duplicates).toBe(1);
  });
  it('rejects feature pages, spoofed hosts, URL credentials and code paths without parsing their inner slugs', () => {
    const result = extractRepositoryCandidates('https://github.com.evil.com/foo/bar https://evil.com/foo/bar github.com/topics/react https://secret@github.com/foo/bar src/utils.ts docs/plans a/b/c https://github.com/orgs/test/repositories');
    expect(result.fullNames).toEqual([]);
  });
  it('rejects malformed owners and empty repository names but supports punctuation and git suffixes', () => {
    expect(extractRepositoryCandidates('https://github.com/-bad/foo https://github.com/ok/.. (https://github.com/owner/repo.git), owner-two/repo_two.').fullNames).toEqual(['owner/repo', 'owner-two/repo_two']);
  });
  it('unwraps underscore Markdown without changing repository underscores', () => {
    expect(extractRepositoryCandidates('__owner/repo__ _https://github.com/second/repo_ __https://github.com/third/repo_with_underscores__').fullNames).toEqual(['owner/repo', 'second/repo', 'third/repo_with_underscores']);
  });
  it('caps a run at 100 repositories and reports overflow without silently running it', () => {
    const result = extractRepositoryCandidates(Array.from({length: 105}, (_, i) => `owner/repo${i}`).join('\n'));
    expect(result.fullNames).toHaveLength(100);
    expect(result.overflow).toBe(5);
  });
  it('limits input size before scanning', () => {
    expect(extractRepositoryCandidates('x'.repeat(512 * 1024 + 1)).error).toBeTruthy();
  });
});
