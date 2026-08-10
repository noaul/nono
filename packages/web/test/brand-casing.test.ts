import { describe, expect, it } from 'vitest';
import { en } from '../src/locales/en';
import { zh } from '../src/locales/zh';

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(stringValues);
}

describe('product name casing', () => {
  it.each([['zh', zh], ['en', en]])('uses compound No* brand names in %s copy', (_, messages) => {
    const copy = stringValues(messages).join('\n');
    expect(copy).not.toMatch(/\b(?:Notab|Notabs|notab|notabs|Nodesk|Nono|NONO|Nomoney|Nostar)\b/);
    expect(copy).toContain('NoTab');
    expect(copy).toContain('NoDesk');
    expect(copy).toContain('NoMoney');
    expect(copy).toContain('NoNo');
    expect(copy).toContain('NoStar');
  });
});
