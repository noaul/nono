import { describe, expect, test } from 'vitest';
import { assertRuntimeSecret } from './secret-crypto.js';

describe('production runtime secrets', () => {
  test('accepts only non-placeholder secrets with sufficient length', () => {
    expect(assertRuntimeSecret('a-unique-runtime-secret-with-at-least-32-characters', 'JWT_SECRET'))
      .toBe('a-unique-runtime-secret-with-at-least-32-characters');

    for (const candidate of ['', 'short', 'replace-with-a-long-random-secret', 'change-me-in-production-even-when-long']) {
      expect(() => assertRuntimeSecret(candidate, 'JWT_SECRET')).toThrow('JWT_SECRET');
    }
  });
});
