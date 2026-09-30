import { beforeEach, describe, expect, it } from 'vitest';
import { readBatchStarHistory, writeBatchStarHistory } from './batchStarHistoryStorage';
import { setStorageScope } from './storageScope';

describe('Batch Star paste history', () => {
  beforeEach(() => localStorage.clear());
  it('isolates histories by NoNo user and refuses unscoped persistence', () => {
    writeBatchStarHistory([{text: 'owner/repo', generatedAt: 10}]);
    expect(readBatchStarHistory()).toEqual([]);
    setStorageScope(1);
    writeBatchStarHistory([{text: 'owner/repo', generatedAt: 10}]);
    setStorageScope(2);
    expect(readBatchStarHistory()).toEqual([]);
    setStorageScope(1);
    expect(readBatchStarHistory()).toEqual([{text: 'owner/repo', generatedAt: 10}]);
  });
  it('deduplicates exact text, caps entries, and allows editing and deletion', () => {
    setStorageScope(1);
    writeBatchStarHistory(Array.from({length: 12}, (_, i) => ({text: `owner/repo${i}`, generatedAt: i})).concat({text: 'owner/repo11', generatedAt: 100}));
    const entries = readBatchStarHistory();
    expect(entries).toHaveLength(10);
    expect(entries[0]).toEqual({text: 'owner/repo11', generatedAt: 100});
    writeBatchStarHistory([{...entries[0], text: 'edited/repo'}]);
    expect(readBatchStarHistory()[0].text).toBe('edited/repo');
    writeBatchStarHistory([]);
    expect(readBatchStarHistory()).toEqual([]);
  });
  it('tolerates corrupted storage and excludes secrets from reusable history', () => {
    setStorageScope(1);
    writeBatchStarHistory([{text: 'owner/repo ghp_' + 'x'.repeat(36), generatedAt: 10}, {text: 'https://secret@github.com/owner/repo', generatedAt: 12}, {text: '{"token": "do-not-store", "repo": "owner/repo"}', generatedAt: 14}, {text: 'safe/repo', generatedAt: 13}]);
    expect(readBatchStarHistory()).toEqual([{text: 'safe/repo', generatedAt: 13}]);
    const key = localStorage.key(1)!;
    localStorage.setItem(key, '{broken');
    expect(readBatchStarHistory()).toEqual([]);
  });
});
