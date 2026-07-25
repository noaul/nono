import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('currency formatting', () => {
  it('formats Canadian dollars distinctly from US dollars', () => {
    expect(formatMoney(1234, 'CAD')).toBe('CA$12.34');
  });
});
