import { getStorageScope, scopedStorageKey } from './storageScope';

export interface BatchStarHistoryEntry { text: string; generatedAt: number }

/** Do not persist pasted credentials, even alongside otherwise valid repository names. */
function containsSecret(text: string): boolean {
  return /\b(?:gh[pousr]_[a-z\d]+|github_pat_[a-z\d_]+|bearer\s+\S+)|(?:token|password|secret|api[_-]?key)["']?\s*[=:]\s*["']?\S+|https?:\/\/[^/\s]+@/i.test(text);
}

function normalizeHistory(value: unknown): BatchStarHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((entry): entry is BatchStarHistoryEntry => Boolean(entry && typeof entry.text === 'string' && entry.text.trim()
    && entry.text.length <= 512 * 1024 && !containsSecret(entry.text) && typeof entry.generatedAt === 'number'
    && Number.isFinite(entry.generatedAt) && !Number.isNaN(new Date(entry.generatedAt).getTime())))
    .sort((a, b) => b.generatedAt - a.generatedAt).filter(entry => {
      if (seen.has(entry.text)) return false;
      seen.add(entry.text);
      return true;
    }).slice(0, 10).map(({text, generatedAt}) => ({text, generatedAt}));
}

export function readBatchStarHistory(): BatchStarHistoryEntry[] {
  if (!getStorageScope()) return [];
  try { return normalizeHistory(JSON.parse(localStorage.getItem(scopedStorageKey('nostar-batch-star-history-v1')) || '[]')); }
  catch { return []; }
}

export function writeBatchStarHistory(entries: BatchStarHistoryEntry[]): void {
  if (!getStorageScope()) return;
  try { localStorage.setItem(scopedStorageKey('nostar-batch-star-history-v1'), JSON.stringify(normalizeHistory(entries))); }
  catch { /* History is optional when browser storage is unavailable. */ }
}
