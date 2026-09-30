import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchStarService } from './batchStarService';
import type { Repository } from '../types';
const repo = (id: number, full_name: string) => ({id, full_name, name: full_name.split('/')[1], owner: {login: full_name.split('/')[0], avatar_url: ''}} as Repository);
const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {status});

describe('Batch Star execution boundaries', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  it('uses the browser backend proxy for stored credentials and never falls back after rejection', async () => {
    vi.mocked(fetch).mockResolvedValue(response({message: 'Unauthorized'}, 401));
    const service = new BatchStarService({backendUrl: '/api/nostar', token: '__nono_server_managed__'});
    const results = await service.preview(['owner/repo']);
    expect(results[0].status).toBe('failed');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/nostar/proxy/github/repos/owner/repo');
    expect(init?.credentials).toBe('same-origin');
    expect(JSON.stringify(init)).not.toContain('__nono_server_managed__');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refuses marker credentials without a backend and validates names before making requests', async () => {
    const service = new BatchStarService({token: '__nono_server_managed__'});
    expect((await service.preview(['owner/repo']))[0].status).toBe('failed');
    await expect(service.preview(['owner/repo/../../user'])).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('previews canonical metadata and errors independently at bounded concurrency', async () => {
    let active = 0; let peak = 0;
    vi.mocked(fetch).mockImplementation(async url => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return String(url).endsWith('missing') ? response({}, 404) : response(repo(1, 'Owner/Canonical'));
    });
    const results = await new BatchStarService({backendUrl: '/api/nostar', concurrency: 2}).preview(['owner/one', 'owner/missing', 'owner/three']);
    expect(results.map(row => row.status)).toEqual(['ready', 'failed', 'ready']);
    expect(results[0].repository?.full_name).toBe('Owner/Canonical');
    expect(peak).toBe(2);
  });
  it('reports partial mutation results, updates each success, awaits sync, and never retries uncertain failures', async () => {
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).endsWith('bad')) throw new TypeError('Failed to fetch');
      return response(null, 204);
    });
    const added: string[] = []; let synced = false;
    const result = await new BatchStarService({backendUrl: '/api/nostar', concurrency: 2}).star([repo(1, 'owner/good'), repo(2, 'owner/bad')], {
      onSuccess: r => { added.push(r.full_name); },
      sync: async () => { await new Promise(resolve => setTimeout(resolve, 5)); synced = true; },
    });
    expect(result.rows.map(row => row.status)).toEqual(['success', 'failed']);
    expect(added).toEqual(['owner/good']);
    expect(synced).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).method).toBe('PUT');
  });
  it('stops queued mutations on cancellation while retaining completed successes and syncing them', async () => {
    const controller = new AbortController(); let synced = false;
    vi.mocked(fetch).mockImplementation(async () => response(null, 204));
    const result = await new BatchStarService({backendUrl: '/api/nostar', concurrency: 1}).star([repo(1, 'owner/one'), repo(2, 'owner/two')], {
      signal: controller.signal, onSuccess: () => controller.abort(), sync: async () => {synced = true;},
    });
    expect(result.rows.map(row => row.status)).toEqual(['success', 'cancelled']);
    expect(synced).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('allows a cancelled in-flight request to confirm success before syncing it', async () => {
    const controller = new AbortController(); let finish!: (value: Response) => void; let synced = false;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const pending = new BatchStarService({backendUrl: '/api/nostar', concurrency: 1}).star([repo(1, 'owner/one'), repo(2, 'owner/two')], {signal: controller.signal, sync: async () => {synced = true;}});
    controller.abort(); finish(response(null, 204));
    const result = await pending;
    expect(result.rows.map(row => row.status)).toEqual(['success', 'cancelled']);
    expect(synced).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('stops queued work on auth or rate-limit failure and returns rate metadata', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', {status: 429, headers: {'x-ratelimit-remaining': '0', 'retry-after': '60'}}));
    const result = await new BatchStarService({backendUrl: '/api/nostar', concurrency: 1}).star([repo(1, 'owner/one'), repo(2, 'owner/two')]);
    expect(result.rows.map(row => row.status)).toEqual(['failed', 'cancelled']);
    expect(result.rateLimit?.remaining).toBe(0);
    expect(result.rateLimit?.retryAfter).toBe(60);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not report an unexpected successful HTTP body as a confirmed Star', async () => {
    vi.mocked(fetch).mockResolvedValue(response({message: 'login page'}, 200));
    const result = await new BatchStarService({backendUrl: '/api/nostar'}).star([repo(1, 'owner/one')]);
    expect(result.rows[0].status).toBe('failed');
    expect(result.rows[0].error).toContain('not confirmed');
  });
  it('retains confirmed successes if local progress rendering fails', async () => {
    vi.mocked(fetch).mockResolvedValue(response(null, 204));
    const result = await new BatchStarService({backendUrl: '/api/nostar'}).star([repo(1, 'owner/one')], {onProgress: () => {throw new Error('Unmounted');}});
    expect(result.rows[0].status).toBe('success');
  });
  it('rejects oversized batches before mutation and reports persistence failure separately from confirmed stars', async () => {
    const service = new BatchStarService({backendUrl: '/api/nostar'});
    await expect(service.star(Array.from({length: 101}, (_, i) => repo(i, `owner/repo${i}`)))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(response(null, 204));
    const result = await service.star([repo(1, 'owner/one')], {sync: async () => {throw new Error('Sync failed');}});
    expect(result.rows[0].status).toBe('success');
    expect(result.syncError).toContain('Sync failed');
  });
});
