import { Repository } from '../types';

interface CategoryRule {
  category: string;
  languages?: string[];
  topics?: string[];
  minStars?: number;
}

const defaultRules: CategoryRule[] = [
  { category: 'Frontend', languages: ['TypeScript', 'JavaScript'], topics: ['react', 'vue', 'angular', 'frontend', 'ui'] },
  { category: 'Backend', languages: ['Go', 'Rust', 'Java', 'C#'], topics: ['backend', 'server', 'api'] },
  { category: 'DevOps', topics: ['docker', 'kubernetes', 'ci-cd', 'devops', 'infrastructure'] },
  { category: 'AI/ML', languages: ['Python', 'Jupyter Notebook'], topics: ['machine-learning', 'deep-learning', 'ai', 'llm', 'nlp'] },
  { category: 'Tools', topics: ['cli', 'tool', 'utility', 'developer-tools'] },
];

export function categorizeRepo(repo: Repository, rules: CategoryRule[] = defaultRules): string | null {
  const lang = repo.language?.toLowerCase() || '';
  const topics = (repo.topics || []).map(t => t.toLowerCase());

  for (const rule of rules) {
    if (rule.minStars && repo.stargazers_count < rule.minStars) continue;
    if (rule.topics?.some(t => topics.includes(t))) return rule.category;
    if (rule.languages?.some(l => l.toLowerCase() === lang)) return rule.category;
  }
  return null;
}

export function categorizeRepos(repos: Repository[], rules?: CategoryRule[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const repo of repos) {
    if (repo.custom_category || repo.category_locked) continue;
    const cat = categorizeRepo(repo, rules);
    if (cat) result.set(repo.full_name, cat);
  }
  return result;
}
