import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backend } from './backendAdapter';
import { GitHubApiService, SERVER_MANAGED_GITHUB_TOKEN } from './githubApi';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GitHubApiService backend integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('automatically uses the authenticated Nono proxy when the backend is available', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) return jsonResponse({ status: 'ok' });
      if (url.endsWith('/settings')) return jsonResponse({ github_token_status: 'ok' });
      if (url.endsWith('/proxy/github/user')) return jsonResponse({ login: 'au', id: 1 });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await backend.init();
    const api = new GitHubApiService(SERVER_MANAGED_GITHUB_TOKEN);
    await expect(api.getCurrentUser()).resolves.toMatchObject({ login: 'au' });

    const proxyCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/proxy/github/user'));
    expect(proxyCall?.[1]).toMatchObject({ method: 'POST' });
    expect((proxyCall?.[1]?.headers as Record<string, string>)?.Authorization).toBeUndefined();
  });
});
