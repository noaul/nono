import { describe, expect, it, vi } from 'vitest';

const verifyPasswordSpy = vi.fn();

vi.mock('../src/utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/crypto.js')>();
  return {
    ...actual,
    verifyPassword: (password: string, stored: string) => {
      verifyPasswordSpy(password, stored);
      return actual.verifyPassword(password, stored);
    },
  };
});

const { loginUser, registerUser } = await import('../src/services/auth.service.js');
const { MemoryRepository } = await import('../src/services/repository.js');

/**
 * Returning early for an unknown username would answer in microseconds where a real account pays
 * for scrypt, which tells an unauthenticated caller exactly which accounts exist. The property that
 * closes it is that the expensive comparison runs on both paths, so that is what is asserted here
 * rather than a wall-clock measurement, which would be flaky under CI load.
 */
describe('login account enumeration', () => {
  it('runs the password comparison even when the username does not exist', async () => {
    const repo = new MemoryRepository(false);
    verifyPasswordSpy.mockClear();

    await expect(loginUser(repo, { username: 'nobody', password: 'whatever1234' }))
      .rejects.toThrow('Invalid username or password');

    expect(verifyPasswordSpy).toHaveBeenCalledTimes(1);
    // Against a real, well-formed hash — not an empty string, which would short-circuit inside
    // verifyPassword and cost nothing.
    expect(verifyPasswordSpy.mock.calls[0][1]).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('fails an unknown username and a wrong password identically', async () => {
    const repo = new MemoryRepository(false);
    await registerUser(repo, { username: 'owner', email: 'owner@example.com', password: 'correct-horse-9' }, 'admin');

    const unknown = await loginUser(repo, { username: 'nobody', password: 'correct-horse-9' }).catch((error) => error);
    const wrong = await loginUser(repo, { username: 'owner', password: 'wrong-horse-9' }).catch((error) => error);

    expect(unknown.message).toBe(wrong.message);
    expect(unknown.statusCode).toBe(wrong.statusCode);
    expect(wrong.statusCode).toBe(401);
  });
});
