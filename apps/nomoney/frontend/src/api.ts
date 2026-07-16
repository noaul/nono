export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

type JsonBody = unknown;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(withBasePath(path), {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new ApiError(response.status, data.error?.message ?? 'Request failed');
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: JsonBody) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: JsonBody) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
import { withBasePath } from './base-path';
