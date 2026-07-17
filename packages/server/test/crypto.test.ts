import { describe, expect, it } from 'vitest';
import { createSessionToken, decryptSecret, encryptSecret, verifySessionToken } from '../src/utils/crypto.js';

describe('crypto utilities', () => {
  it('accepts a valid session token and rejects tampered signatures of any length', () => {
    const secret = 'test-session-secret-that-is-long-enough';
    const token = createSessionToken({ id: 7, username: 'admin' }, secret);
    const [payload, signature] = token.split('.');
    const tamperedSuffix = signature.endsWith('A') ? 'B' : 'A';

    expect(verifySessionToken(token, secret)).toMatchObject({ uid: 7, username: 'admin' });
    expect(verifySessionToken(`${payload}.${signature.slice(0, -1)}${tamperedSuffix}`, secret)).toBeNull();
    expect(verifySessionToken(`${payload}.short`, secret)).toBeNull();
  });

  it('rejects invalid encryption keys instead of using a public fallback', () => {
    expect(() => encryptSecret('secret', 'too-short')).toThrow('Encryption key must be 64 hexadecimal characters');
    expect(() => encryptSecret('secret', 'z'.repeat(64))).toThrow('Encryption key must be 64 hexadecimal characters');
  });

  it('round trips encrypted values with a valid key', () => {
    const key = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    expect(decryptSecret(encryptSecret('secret', key), key)).toBe('secret');
  });
});
