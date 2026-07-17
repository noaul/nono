import { describe, it, expect } from 'vitest';
import { localSearch } from '../services/localSearch';
import { Repository } from '../types';

const makeRepo = (overrides: Partial<Repository>): Repository => ({
  id: 1, name: 'test', full_name: 'user/test', description: null,
  html_url: '', stargazers_count: 0, forks_count: 0, forks: 0,
  language: null, created_at: '', updated_at: '', pushed_at: '',
  owner: { login: 'user', avatar_url: '' }, topics: [],
  ...overrides,
});

describe('localSearch', () => {
  const repos = [
    makeRepo({ id: 1, name: 'react', full_name: 'facebook/react', description: 'A JavaScript library for building user interfaces', language: 'JavaScript', ai_tags: ['ui', 'frontend'] }),
    makeRepo({ id: 2, name: 'vue', full_name: 'vuejs/vue', description: 'Progressive framework', language: 'TypeScript' }),
    makeRepo({ id: 3, name: 'rust-lang', full_name: 'rust-lang/rust', description: 'Systems programming', language: 'Rust' }),
  ];

  it('returns all repos for empty query', () => {
    expect(localSearch(repos, '')).toHaveLength(3);
  });

  it('matches by name', () => {
    expect(localSearch(repos, 'react')).toHaveLength(1);
  });

  it('matches by description', () => {
    expect(localSearch(repos, 'framework')).toHaveLength(1);
  });

  it('matches by language', () => {
    expect(localSearch(repos, 'rust')).toHaveLength(1);
  });

  it('matches by ai_tags', () => {
    expect(localSearch(repos, 'frontend')).toHaveLength(1);
  });

  it('supports multi-term AND search', () => {
    expect(localSearch(repos, 'javascript library')).toHaveLength(1);
  });
});
