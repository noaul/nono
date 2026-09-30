export interface GitHubList {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  items: string[];
}
export interface GitHubListsRateLimit {
  remaining: number;
  resetAt: string;
  cost: number;
}
export const normalizeListRepo = (name: string): string => name.trim().toLowerCase();
