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

/** Fired on window when an authenticated admin call comes back 401: the session expired or was revoked. */
export const SESSION_EXPIRED_EVENT = 'nono:session-expired';

function isAdminApi(url: string) {
  try {
    return new URL(url, window.location.origin).pathname.startsWith('/api/admin/');
  } catch {
    return false;
  }
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
  // The router listens for this; the caller still gets the usual error below.
  if (response.status === 401 && isAdminApi(url)) window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { url } }));
  return unwrapApiResponse<T>(payload);
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}

const DEFAULT_SEARCH_TEMPLATE = 'https://www.google.com/search?q={query}';

function isHttpUrl(value: string) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildSearchUrl(query: string, template = DEFAULT_SEARCH_TEMPLATE) {
  const encoded = encodeURIComponent(query.trim());
  const candidate = (template || '').trim();
  // Legacy templates were stored unchecked; never send a visitor to a javascript:/data: URL.
  if (candidate.includes('{query}')) {
    const url = candidate.replace('{query}', encoded);
    if (isHttpUrl(url)) return url;
  }
  return DEFAULT_SEARCH_TEMPLATE.replace('{query}', encoded);
}
