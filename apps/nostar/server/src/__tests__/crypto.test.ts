import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { encrypt, decrypt } from '../services/crypto.js';

const key = crypto.randomBytes(32).toString('hex');

describe('crypto', () => {
  it('encrypts and decrypts', () => {
    const text = 'ghp_secret123';
    expect(decrypt(encrypt(text, key), key)).toBe(text);
  });

  it('fails with wrong key', () => {
    const encrypted = encrypt('data', key);
    const badKey = crypto.randomBytes(32).toString('hex');
    expect(() => decrypt(encrypted, badKey)).toThrow();
  });
});
