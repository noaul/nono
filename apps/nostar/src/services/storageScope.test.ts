import { beforeEach, describe, expect, it } from 'vitest';
import { getStorageScope, scopedStorageKey, setStorageScope, STORAGE_SCOPE_KEY } from './storageScope';

describe('NoStar storage scope', () => {
  beforeEach(() => localStorage.clear());

  it('keeps persisted state separate for each NoNo user', () => {
    expect(scopedStorageKey('nostar-state')).toBe('nostar-state');
    expect(setStorageScope(12)).toBe(true);
    expect(getStorageScope()).toBe('12');
    expect(localStorage.getItem(STORAGE_SCOPE_KEY)).toBe('12');
    expect(scopedStorageKey('nostar-state')).toBe('nostar-state:nono:12');
  });
});
