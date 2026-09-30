import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIAnalysisOptimizer } from './aiAnalysisOptimizer';
import { AIService } from './aiService';
import type { Repository } from '../types';
import { backend } from './backendAdapter';
const repo = { id: 1, full_name: 'owner/repo' } as Repository;
const ai = new AIService({ id: 'test', name: 'test', baseUrl: 'https://ai.example', apiKey: '***', model: 'model', isActive: true });

describe('optimizer cancellation', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it('aborts every active worker rather than only the latest request', async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(ai, 'analyzeRepository').mockImplementation(async (_repo, _readme, _categories, signal) => {
      signals.push(signal!);
      return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    });
    const optimizer = new AIAnalysisOptimizer();
    const tasks = [optimizer.analyzeWithRetry({ repo, readmeContent: '', retries: 0 }, ai, []), optimizer.analyzeWithRetry({ repo, readmeContent: '', retries: 0 }, ai, [])];
    await Promise.resolve();
    optimizer.abort();
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect((await Promise.all(tasks)).map(task => task.success)).toEqual([false, false]);
  });
  it('finishes cancellation during retry backoff without waiting for the timer', async () => {
    vi.useFakeTimers();
    vi.spyOn(ai, 'analyzeRepository').mockRejectedValue(new Error('Network unavailable'));
    const optimizer = new AIAnalysisOptimizer({ retryDelayBaseMs: 10000 });
    let finished = false;
    const pending = optimizer.analyzeWithRetry({ repo, readmeContent: '', retries: 0 }, ai, []).then(result => { finished = true; return result; });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    optimizer.abort();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(finished).toBe(true);
    expect((await pending).success).toBe(false);
  });
  it.each(['status', 'statusCode'])('does not restart analysis after the service exhausts its 429 retries using %s', async (statusField) => {
    vi.useFakeTimers();
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
    let started = 0;
    vi.spyOn(backend, 'proxyAIRequestWithFallback').mockImplementation(async () => {
      started++;
      throw Object.assign(new Error('Too many requests'), { [statusField]: 429, retryAfterMs: 5000 });
    });
    const service = new AIService({ id: `exhausted-${statusField}`, name: 'test', baseUrl: 'https://ai.example', apiKey: '***', model: 'model', isActive: true });
    const optimizer = new AIAnalysisOptimizer();
    let finished = false;
    const pending = optimizer.analyzeWithRetry({ repo, readmeContent: '', retries: 0 }, service, []).then(result => { finished = true; return result; });
    await vi.advanceTimersByTimeAsync(10000);
    expect(finished).toBe(true);
    expect(started).toBe(3);
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({ [statusField]: 429 });
  });

});
