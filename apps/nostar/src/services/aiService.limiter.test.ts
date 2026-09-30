import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIConfig } from '../types';
import { AIService } from './aiService';
import { backend } from './backendAdapter';
import { STORAGE_SCOPE_KEY } from './storageScope';

const config = (id: string): AIConfig => ({ id, name: id, apiType: 'openai', baseUrl: 'https://ai.example/v1', apiKey: '***', model: 'model', isActive: true });
const response = { choices: [{ message: { content: 'Ideal repository' } }] };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe('shared AI request admission', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true); });
  afterEach(() => { localStorage.removeItem(STORAGE_SCOPE_KEY); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('bounds simultaneous requests across service instances and cancels a queued request', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    vi.spyOn(backend, 'proxyAIRequestWithFallback').mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const ai = new AIService(config('shared-concurrency'));
    const other = new AIService(config('shared-concurrency'));
    const requests = [ai.generateHyDEQuery('one'), ai.generateHyDEQuery('two'), other.generateHyDEQuery('three')];
    const controller = new AbortController();
    const queued = other.generateHyDEQuery('four', controller.signal);
    const rejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(resolvers).toHaveLength(3);
    controller.abort();
    await rejected;
    resolvers.forEach(resolve => resolve(response));
    expect(await Promise.all(requests)).toEqual(['Ideal repository', 'Ideal repository', 'Ideal repository']);
  });

  it('shares a provider cooldown with another instance and retries after Retry-After', async () => {
    let started = 0;
    vi.spyOn(backend, 'proxyAIRequestWithFallback').mockImplementation(async () => {
      started++;
      if (started === 1) throw Object.assign(new Error('Too many requests'), { statusCode: 429, retryAfterMs: 5000 });
      return response;
    });
    const ai = new AIService(config('shared-cooldown'));
    const first = ai.generateHyDEQuery('one');
    // Consume rejection in the pre-limiter implementation to avoid an unhandled error during RED.
    const result = first.catch(error => error);
    await flush();
    const second = new AIService(config('shared-cooldown')).generateHyDEQuery('two');
    await flush();
    expect(started).toBe(1);
    await vi.advanceTimersByTimeAsync(4999);
    expect(started).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('Ideal repository');
    expect(await second).toBe('Ideal repository');
  });

  it('aborts a retry waiting for shared cooldown without another provider call', async () => {
    let started = 0;
    vi.spyOn(backend, 'proxyAIRequestWithFallback').mockImplementation(async () => {
      started++;
      throw Object.assign(new Error('Too many requests'), { status: 429, retryAfterMs: 5000 });
    });
    const controller = new AbortController();
    const pending = new AIService(config('cancel-cooldown')).generateHyDEQuery('one', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(10000);
    expect(started).toBe(1);
  });
  it('counts completed and failed attempts against the shared sliding RPM window', async () => {
    let started = 0;
    vi.spyOn(backend, 'proxyAIRequestWithFallback').mockImplementation(async () => {
      started++;
      if (started === 1) throw Object.assign(new Error('Bad request'), { status: 400 });
      return response;
    });
    const ai = new AIService(config('shared-rpm'));
    await expect(ai.generateHyDEQuery('failed')).rejects.toMatchObject({ status: 400 });
    for (let i = 0; i < 59; i++) await ai.generateHyDEQuery(String(i));
    const pending = new AIService(config('shared-rpm')).generateHyDEQuery('next');
    await flush();
    expect(started).toBe(60);
    await vi.advanceTimersByTimeAsync(59999);
    expect(started).toBe(60);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe('Ideal repository');
    expect(started).toBe(61);
  });

  it('preserves provider HTTP error metadata in the direct request path', async () => {
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(false);
    vi.stubGlobal('fetch', async () => new Response('{"error":"unauthorized"}', { status: 401, headers: { 'retry-after': '7' } }));
    try {
      await expect(new AIService(config('direct-metadata')).generateHyDEQuery('one')).rejects.toMatchObject({ status: 401, statusCode: 401, retryAfterMs: 7000 });
    } finally { vi.unstubAllGlobals(); }
  });

  it('limits persistent 429 retries and keeps cancellation available', async () => {
    let started = 0;
    vi.spyOn(backend, 'proxyAIRequestWithFallback').mockImplementation(async () => {
      started++;
      throw Object.assign(new Error('Too many requests'), { status: 429, retryAfterMs: 5000 });
    });
    const pending = new AIService(config('persistent-cooldown')).generateHyDEQuery('one').catch(error => error);
    await flush();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toMatchObject({ status: 429 });
    expect(started).toBe(3);
  });

  it('keeps request admission separate after switching NoNo user scope', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    vi.spyOn(backend, 'proxyAIRequestWithFallback').mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    localStorage.setItem(STORAGE_SCOPE_KEY, 'user-one');
    const ai = new AIService(config('scoped-concurrency'));
    const requests = [ai.generateHyDEQuery('one'), ai.generateHyDEQuery('two'), ai.generateHyDEQuery('three')];
    await flush();
    localStorage.setItem(STORAGE_SCOPE_KEY, 'user-two');
    const other = new AIService(config('scoped-concurrency')).generateHyDEQuery('four');
    await flush();
    expect(resolvers).toHaveLength(4);
    resolvers.forEach(resolve => resolve(response));
    expect(await Promise.all([...requests, other])).toHaveLength(4);
  });

});
