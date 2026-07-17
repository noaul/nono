import { Repository } from '../types';

export function localSearch(repos: Repository[], query: string): Repository[] {
  if (!query.trim()) return repos;
  const terms = query.toLowerCase().split(/\s+/);
  return repos.filter(repo => {
    const text = [
      repo.name,
      repo.full_name,
      repo.description,
      repo.ai_summary,
      repo.ai_tags?.join(' '),
      repo.language,
    ].filter(Boolean).join(' ').toLowerCase();
    return terms.every(t => text.includes(t));
  });
}
