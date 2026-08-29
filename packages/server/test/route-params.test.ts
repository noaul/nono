import type { FastifyInstance, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { numericParam } from '../src/utils/route-params.js';

const requestWith = (params: unknown) => ({ params } as FastifyRequest);

/**
 * These ids go straight to Prisma, which rejects a NaN id with a validation error carrying no
 * status code — so an unparsable segment used to surface as a 500 rather than a 400.
 */
describe('numericParam', () => {
  it('accepts a positive integer id', () => {
    expect(numericParam(requestWith({ id: '42' }))).toBe(42);
  });

  it.each([
    ['a non-numeric segment', { id: 'abc' }],
    ['an empty segment', { id: '' }],
    ['a missing segment', {}],
    ['undefined params', undefined],
    ['a fractional id', { id: '1.5' }],
    ['a negative id', { id: '-3' }],
    ['zero', { id: '0' }],
    ['infinity', { id: 'Infinity' }],
  ])('rejects %s with a 400', (_label, params) => {
    expect(() => numericParam(requestWith(params))).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Invalid id parameter' }),
    );
  });

  it('reads a named segment other than id', () => {
    expect(numericParam(requestWith({ linkId: '7' }), 'linkId')).toBe(7);
    expect(() => numericParam(requestWith({ linkId: 'x' }), 'linkId')).toThrow('Invalid linkId parameter');
  });
});

/**
 * The unit tests above cover the parsing itself; this one pins where it sits. MemoryRepository
 * tolerates a NaN id, so the assertion that matters is that the request is rejected before it ever
 * reaches the repository — that is what keeps the Prisma-backed path from raising a bare 500.
 */
describe('numeric route params over the wire', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;

  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({
      repo,
      sessionSecret: 'test-session-secret-that-is-long-enough',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password: 'Password2026!' },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects an unparsable clip id with 400 without touching the repository', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'Password2026!' },
    });
    const setCookie = login.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);

    const response = await app.inject({ method: 'GET', url: '/api/clipper/clips/abc', headers: { cookie } });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('Invalid id parameter');
  });
});
