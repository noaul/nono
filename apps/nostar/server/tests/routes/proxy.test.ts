import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAxios = vi.hoisted(() => Object.assign(vi.fn(), {
  isAxiosError: (error: unknown) =>
    typeof error === 'object' && error !== null && 'isAxiosError' in error,
}));

vi.mock('axios', () => ({
  default: mockAxios,
}));

import { proxyRequest } from '../../src/services/proxyService.js';

const axiosResponse = (
  status: number,
  data: unknown,
  headers: Record<string, string> = {}
) => ({ status, data, headers });

describe('proxyRequest', () => {
  beforeEach(() => {
    mockAxios.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should forward GET request and return JSON response', async () => {
    const responseData = { items: [1, 2, 3] };
    mockAxios.mockResolvedValueOnce(axiosResponse(200, responseData, {
      'content-type': 'application/json',
      'x-ratelimit': '100',
    }));

    const result = await proxyRequest({
      url: 'https://api.github.com/user/starred',
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(result).toEqual({
      status: 200,
      data: responseData,
      headers: {
        'content-type': 'application/json',
        'x-ratelimit': '100',
      },
    });
    expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.github.com/user/starred',
      method: 'get',
      headers: { Authorization: 'Bearer test-token' },
      timeout: 30000,
      proxy: false,
    }));
    expect(mockAxios.mock.calls[0][0].data).toBeUndefined();
  });

  it('should forward POST request with an object body', async () => {
    const requestBody = { model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }] };
    const responseData = { choices: [{ message: { content: 'hi' } }] };
    mockAxios.mockResolvedValueOnce(axiosResponse(200, responseData, {
      'content-type': 'application/json',
    }));

    const result = await proxyRequest({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
      body: requestBody,
    });

    expect(result.status).toBe(200);
    expect(result.data).toEqual(responseData);
    expect(mockAxios.mock.calls[0][0]).toMatchObject({
      method: 'post',
      data: requestBody,
    });
  });

  it('should forward a string body and preserve text responses', async () => {
    const xmlBody = '<?xml version="1.0"?><propfind/>';
    mockAxios.mockResolvedValueOnce(axiosResponse(207, '<multistatus/>', {
      'content-type': 'application/xml',
    }));

    const result = await proxyRequest({
      url: 'https://dav.example.com/remote.php/dav',
      method: 'PROPFIND',
      headers: { 'Content-Type': 'application/xml' },
      body: xmlBody,
      preserveRawResponse: true,
    });

    expect(result).toMatchObject({ status: 207, data: '<multistatus/>' });
    expect(mockAxios.mock.calls[0][0]).toMatchObject({
      method: 'propfind',
      data: xmlBody,
      responseType: 'text',
    });
  });

  it('should auto-set Content-Type for object bodies', async () => {
    mockAxios.mockResolvedValueOnce(axiosResponse(200, { ok: true }, {
      'content-type': 'application/json',
    }));

    await proxyRequest({
      url: 'https://example.com/api',
      method: 'POST',
      body: { key: 'value' },
    });

    expect(mockAxios.mock.calls[0][0].headers).toMatchObject({
      'Content-Type': 'application/json',
    });
  });

  it.each(['GET', 'HEAD'])('should not attach a body for %s requests', async (method) => {
    mockAxios.mockResolvedValueOnce(axiosResponse(200, {}, {
      'content-type': 'application/json',
    }));

    await proxyRequest({
      url: 'https://example.com/check',
      method,
      body: { should: 'be-ignored' },
    });

    expect(mockAxios.mock.calls[0][0].data).toBeUndefined();
  });

  it('should return text data when the response is not JSON', async () => {
    mockAxios.mockResolvedValueOnce(axiosResponse(200, '<html>hello</html>', {
      'content-type': 'text/html',
    }));

    const result = await proxyRequest({
      url: 'https://example.com/page',
      method: 'GET',
    });

    expect(result).toMatchObject({ status: 200, data: '<html>hello</html>' });
  });

  it('should return 504 on Axios timeout errors', async () => {
    mockAxios.mockRejectedValueOnce({
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 100ms exceeded',
    });

    const result = await proxyRequest({
      url: 'https://slow.example.com/api',
      method: 'GET',
      timeout: 100,
    });

    expect(result).toEqual({
      status: 504,
      headers: {},
      data: { error: 'Gateway Timeout', code: 'GATEWAY_TIMEOUT' },
    });
  });

  it('should return 502 with PROXY_CONNECTION_REFUSED on ECONNREFUSED', async () => {
    mockAxios.mockRejectedValueOnce({
      isAxiosError: true,
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED',
    });

    const result = await proxyRequest({
      url: 'https://down.example.com/api',
      method: 'GET',
    });

    expect(result.status).toBe(502);
    expect(result.data).toEqual({
      error: 'Proxy connection refused',
      code: 'PROXY_CONNECTION_REFUSED',
      details: 'connect ECONNREFUSED',
    });
  });

  it('should pass custom and default timeout values to Axios', async () => {
    mockAxios
      .mockResolvedValueOnce(axiosResponse(200, {}))
      .mockResolvedValueOnce(axiosResponse(200, {}));

    await proxyRequest({
      url: 'https://example.com/custom',
      method: 'GET',
      timeout: 5000,
    });
    await proxyRequest({
      url: 'https://example.com/default',
      method: 'GET',
    });

    expect(mockAxios.mock.calls[0][0].timeout).toBe(5000);
    expect(mockAxios.mock.calls[1][0].timeout).toBe(30000);
  });

  it('should pass upstream HTTP status codes through', async () => {
    mockAxios.mockResolvedValueOnce(axiosResponse(403, { message: 'Forbidden' }, {
      'content-type': 'application/json',
    }));

    const result = await proxyRequest({
      url: 'https://api.github.com/forbidden',
      method: 'GET',
    });

    expect(result).toMatchObject({
      status: 403,
      data: { message: 'Forbidden' },
    });
  });

  it('should handle PUT requests for WebDAV', async () => {
    mockAxios.mockResolvedValueOnce(axiosResponse(201, ''));

    const result = await proxyRequest({
      url: 'https://dav.example.com/remote.php/dav/backup.json',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"repos":[]}',
    });

    expect(result.status).toBe(201);
    expect(mockAxios.mock.calls[0][0]).toMatchObject({
      method: 'put',
      data: '{"repos":[]}',
    });
  });

  it('should explicitly disable environment proxies when no proxy is configured', async () => {
    mockAxios.mockResolvedValueOnce(axiosResponse(200, {}));

    await proxyRequest({
      url: 'https://example.com/api',
      method: 'GET',
    });

    expect(mockAxios.mock.calls[0][0].proxy).toBe(false);
  });

  it('should forward private-IP URLs when allowPrivate is set', async () => {
    mockAxios.mockResolvedValueOnce(axiosResponse(200, { ok: true }, {
      'content-type': 'application/json',
    }));

    const result = await proxyRequest({
      url: 'http://192.168.1.10:11434/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: 'Bearer local' },
      body: { model: 'llama', messages: [] },
      allowPrivate: true,
    });

    expect(result.status).toBe(200);
    expect(mockAxios.mock.calls[0][0].url).toBe(
      'http://192.168.1.10:11434/v1/chat/completions'
    );
  });

  it('should reject private-IP URLs in strict mode without calling Axios', async () => {
    const result = await proxyRequest({
      url: 'http://192.168.1.10:11434/v1/chat/completions',
      method: 'POST',
    });

    expect(result.status).toBe(502);
    expect(mockAxios).not.toHaveBeenCalled();
  });
});
