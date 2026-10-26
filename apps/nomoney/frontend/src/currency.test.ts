import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('currency formatting', () => {
  it('formats Canadian dollars distinctly from US dollars', () => {
    expect(formatMoney(1234, 'CAD')).toBe('CA$12.34');
  });

  it('groups thousands and keeps the sign ahead of the symbol', () => {
    expect(formatMoney(123456789, 'CNY')).toBe('¥1,234,567.89');
    expect(formatMoney(-1250, 'USD')).toBe('-$12.50');
    expect(formatMoney(0, 'EUR')).toBe('€0.00');
  });
});
