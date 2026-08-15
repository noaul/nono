/**
 * Same-origin session client. Clipper is served by the Nono server, so the browser's nono_session
 * cookie authenticates every call — there is no token stored in this app.
 */

export const LOGIN_REDIRECT = '/login?next=%2Fclipper%2F';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ClipListItem {
  id: number;
  url: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  siteName: string | null;
  domain: string;
  description: string | null;
  excerpt: string;
  wordCount: number;
  favicon: string | null;
  image: string | null;
  publishedAt: string | null;
  status: ClipStatus;
  starred: boolean;
  extractor: string;
  contentTruncated: boolean;
  contentVersion: number;
  linkId: number | null;
  clippedAt: string;
}

export interface ClipDetail extends ClipListItem {
  contentHtml: string;
  contentMd: string;
  tags: Array<{ tag: ClipTag }>;
  highlights: ClipHighlight[];
}

export interface ClipTag {
  id: number;
  name: string;
  normalizedName: string;
  color: string | null;
}

export interface ClipHighlight {
  id: number;
  clipId: number;
  text: string;
  note: string | null;
  color: string;
  contentVersion: number;
  anchor: HighlightAnchor;
  createdAt: string;
}

export interface HighlightAnchor {
  quote: string;
  prefix?: string;
  suffix?: string;
  startOffset?: number;
  endOffset?: number;
}

export type ClipStatus = 'unread' | 'reading' | 'archived';

export interface ClipListResponse {
  items: ClipListItem[];
  total: number;
  limit: number;
  offset: number;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  // A stale session must land on the login page rather than an empty list that looks like "no
  // clips yet".
  if (response.status === 401) {
    window.location.href = LOGIN_REDIRECT;
    throw new ApiError('Authentication required', 401);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 0) {
    throw new ApiError(payload?.message || `Request failed (${response.status})`, response.status);
  }
  return payload.data as T;
}

export const api = {
  listClips(query: Record<string, string | number | undefined> = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const suffix = search.toString();
    return request<ClipListResponse>(`/api/clipper/clips${suffix ? `?${suffix}` : ''}`);
  },

  getClip(id: number) {
    return request<ClipDetail>(`/api/clipper/clips/${id}`);
  },

  updateClip(id: number, patch: Partial<Pick<ClipListItem, 'status' | 'starred' | 'title'>>) {
    return request<ClipListItem>(`/api/clipper/clips/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteClip(id: number) {
    return request<{ ok: true }>(`/api/clipper/clips/${id}`, { method: 'DELETE' });
  },

  refetchClip(id: number) {
    return request<ClipListItem>(`/api/clipper/clips/${id}/refetch`, { method: 'POST' });
  },

  search(q: string, limit = 30, offset = 0) {
    const search = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
    return request<{ items: ClipListItem[]; query: string; limit: number; offset: number }>(
      `/api/clipper/search?${search.toString()}`,
    );
  },

  listTags() {
    return request<ClipTag[]>('/api/clipper/tags');
  },

  createTag(name: string, color?: string) {
    return request<ClipTag>('/api/clipper/tags', {
      method: 'POST',
      body: JSON.stringify({ name, ...(color ? { color } : {}) }),
    });
  },

  updateTag(id: number, patch: { name?: string; color?: string | null }) {
    return request<ClipTag>(`/api/clipper/tags/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  deleteTag(id: number) {
    return request<{ ok: true }>(`/api/clipper/tags/${id}`, { method: 'DELETE' });
  },

  assignTags(clipId: number, tagIds: number[]) {
    return request<{ assigned: number }>(`/api/clipper/clips/${clipId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tagIds }),
    });
  },

  addHighlight(clipId: number, input: { text: string; anchor: HighlightAnchor; note?: string; color?: string }) {
    return request<ClipHighlight>(`/api/clipper/clips/${clipId}/highlights`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  deleteHighlight(id: number) {
    return request<{ ok: true }>(`/api/clipper/highlights/${id}`, { method: 'DELETE' });
  },
};
