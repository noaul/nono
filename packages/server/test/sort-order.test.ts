import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSortOrder } from '../src/utils/sort-order';

describe('createSortOrder', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps later and batch-appended items behind earlier items', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
    const first = createSortOrder();
    const secondInBatch = createSortOrder(1);

    vi.setSystemTime(new Date('2026-07-15T00:00:01.000Z'));
    const later = createSortOrder();

    expect(first).toBeGreaterThan(secondInBatch);
    expect(secondInBatch).toBeGreaterThanOrEqual(later);
  });
});
