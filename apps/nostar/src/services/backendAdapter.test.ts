import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backend } from './backendAdapter';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('backendAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not mark a backend as available when health passes but authenticated routes reject it', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return jsonResponse({ status: 'ok', version: 'test', timestamp: 'now' });
      }
      if (url.endsWith('/settings')) {
        return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await backend.init();

    expect(backend.isAvailable).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/health'), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/settings'), expect.any(Object));
  });

  it('marks a backend as available when health and authenticated routes pass', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return jsonResponse({ status: 'ok', version: 'test', timestamp: 'now' });
      }
      if (url.endsWith('/settings')) {
        return jsonResponse({});
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await backend.init();

    expect(backend.isAvailable).toBe(true);
  });

  it('uses the NoStar API mount and same-origin session credentials', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return jsonResponse({ status: 'ok', version: 'test', timestamp: 'now' });
      }
      if (url.endsWith('/settings')) {
        return jsonResponse({});
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await backend.init();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/nostar/health'), expect.any(Object));
    const settingsCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/settings'));
    expect(settingsCall?.[1]).toMatchObject({
      credentials: 'same-origin',
    });
    expect(settingsCall?.[1]?.headers).not.toHaveProperty('Authorization');
  });

  it('never asks the server to decrypt integration credentials', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) return jsonResponse({ status: 'ok' });
      if (url.endsWith('/settings')) return jsonResponse({});
      if (url.includes('/configs/ai')) return jsonResponse([]);
      if (url.includes('/configs/webdav')) return jsonResponse([]);
      if (url.includes('/configs/embedding')) return jsonResponse([]);
      if (url.includes('/configs/vector-search')) return jsonResponse({ enabled: false });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await backend.init();

    await backend.fetchAIConfigs();
    await backend.fetchWebDAVConfigs();
    await backend.fetchEmbeddingConfigs();
    await backend.fetchVectorSearchConfig();

    expect(fetchMock.mock.calls.map(([url]) => String(url)).join('\n')).not.toContain('decrypt=true');
  });

  it('sends releases as a full snapshot so server-side deletions persist', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) return jsonResponse({ status: 'ok' });
      if (url.endsWith('/settings')) return jsonResponse({});
      if (url.endsWith('/releases')) return jsonResponse({ synced: 0 });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await backend.init();

    await backend.syncReleases([]);

    const request = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/releases') && init?.method === 'PUT');
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ releases: [], isFullSync: true });
  });
});
