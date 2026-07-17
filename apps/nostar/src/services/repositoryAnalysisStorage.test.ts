import { describe, it, expect, beforeEach } from 'vitest';
import type { Repository } from '../types';
import {
  mergeRepositoryAnalysisSnapshots,
  saveRepositoryAnalysisSnapshot,
} from './repositoryAnalysisStorage';

const makeRepo = (overrides: Partial<Repository> = {}): Repository => ({
  id: 42,
  name: 'demo',
  full_name: 'owner/demo',
  description: 'Original description',
  html_url: 'https://github.com/owner/demo',
  stargazers_count: 10,
  forks_count: 1,
  forks: 1,
  language: 'TypeScript',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  pushed_at: '2024-01-03T00:00:00Z',
  owner: {
    login: 'owner',
    avatar_url: 'https://example.com/avatar.png',
  },
  topics: [],
  ...overrides,
});

describe('repositoryAnalysisStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores AI analysis fields and category after repository state reloads without them', async () => {
    await saveRepositoryAnalysisSnapshot(makeRepo({
      ai_summary: 'AI generated summary',
      ai_tags: ['developer tools', 'typescript'],
      ai_platforms: ['web'],
      analyzed_at: '2026-05-11T08:00:00.000Z',
      analysis_failed: false,
      custom_category: 'Development Tools',
      category_locked: true,
    }));

    const [restored] = await mergeRepositoryAnalysisSnapshots([
      makeRepo({
        ai_tags: [],
        ai_platforms: [],
        analyzed_at: undefined,
        custom_category: undefined,
        category_locked: false,
      }),
    ]);

    expect(restored.ai_summary).toBe('AI generated summary');
    expect(restored.ai_tags).toEqual(['developer tools', 'typescript']);
    expect(restored.ai_platforms).toEqual(['web']);
    expect(restored.analyzed_at).toBe('2026-05-11T08:00:00.000Z');
    expect(restored.analysis_failed).toBe(false);
    expect(restored.custom_category).toBe('Development Tools');
    expect(restored.category_locked).toBe(true);
  });
});
