import { describe, expect, test } from 'vitest';
import { toIsoDate } from './utils.js';

describe('Shanghai date handling', () => {
  test('uses Asia/Shanghai for calendar dates around UTC midnight', () => {
    expect(toIsoDate(new Date('2026-08-14T16:30:00.000Z'))).toBe('2026-08-15');
    expect(toIsoDate(new Date('2026-08-14T15:30:00.000Z'))).toBe('2026-08-14');
  });
});
