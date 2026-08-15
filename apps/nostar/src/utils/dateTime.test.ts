import { describe, expect, it } from 'vitest';
import { formatShanghaiDateTime, shanghaiDateKey } from './dateTime';

describe('NoStar Shanghai time', () => {
  it('formats persisted timestamps in Asia/Shanghai', () => {
    const value = new Date('2026-08-15T00:30:00.000Z');
    expect(shanghaiDateKey(value)).toBe('2026-08-15');
    expect(formatShanghaiDateTime(value, 'zh-CN')).toContain('08:30');
  });
});
