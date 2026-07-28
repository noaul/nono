export interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

export class ApiError extends Error {
  code: number;

  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

export function unwrapApiResponse<T>(envelope: ApiEnvelope<T>) {
  if (envelope.code !== 0) throw new ApiError(envelope.message || 'Request failed', envelope.code);
  return envelope.data;
}

/** Reads the active locale without importing the composable (keeps this module dependency-free). */
function currentLocale(): string {
  try {
    const stored = window.localStorage.getItem('nono:locale');
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    // Fall through to the document language when storage is unavailable.
  }
  return document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
}

export async function apiRequest<T>(url: string, options: RequestInit = {}) {
  const hasBody = options.body !== undefined;
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      // The visitor's choice lives in localStorage, so Accept-Language alone is not enough.
      'x-nono-locale': currentLocale(),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : { code: response.ok ? 0 : response.status, data: await response.text(), message: response.statusText };
  return unwrapApiResponse<T>(payload);
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}

export function buildSearchUrl(query: string, template = 'https://www.google.com/search?q={query}') {
  const encoded = encodeURIComponent(query.trim());
  return (template || 'https://www.google.com/search?q={query}').includes('{query}')
    ? (template || 'https://www.google.com/search?q={query}').replace('{query}', encoded)
    : `https://www.google.com/search?q=${encoded}`;
}
