import { describe, expect, test } from 'vitest';
import { shanghaiDateKey } from './format';

describe('Shanghai frontend dates', () => {
  test('uses the Shanghai calendar day near UTC midnight', () => {
    expect(shanghaiDateKey(new Date('2026-08-14T16:30:00.000Z'))).toBe('2026-08-15');
  });
});
