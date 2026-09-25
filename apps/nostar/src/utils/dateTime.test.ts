import { describe, expect, it } from 'vitest';
import { formatRelativeTime, formatShanghaiDateTime, shanghaiDateKey } from './dateTime';

describe('NoStar Shanghai time', () => {
  it('formats persisted timestamps in Asia/Shanghai', () => {
    const value = new Date('2026-08-15T00:30:00.000Z');
    expect(shanghaiDateKey(value)).toBe('2026-08-15');
    expect(formatShanghaiDateTime(value, 'zh-CN')).toContain('08:30');
  });
});

describe('NoStar relative time', () => {
  const now = Date.parse('2026-09-25T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const DAY = 86_400_000;

  it('follows the UI language instead of always printing English', () => {
    const pushed = ago(270 * DAY);
    expect(formatRelativeTime(pushed, 'zh', now)).toBe('9个月前');
    expect(formatRelativeTime(pushed, 'en', now)).toBe('9 months ago');
  });

  it('steps through humanised units', () => {
    expect(formatRelativeTime(ago(10_000), 'zh', now)).toBe('现在');
    expect(formatRelativeTime(ago(5 * 60_000), 'en', now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(3 * 3_600_000), 'zh', now)).toBe('3小时前');
    expect(formatRelativeTime(ago(DAY), 'zh', now)).toBe('昨天');
    expect(formatRelativeTime(ago(3 * 365 * DAY), 'en', now)).toBe('3 years ago');
  });

  it('returns an empty string for an unparseable date rather than "Invalid Date"', () => {
    expect(formatRelativeTime('not a date', 'zh', now)).toBe('');
  });
});
