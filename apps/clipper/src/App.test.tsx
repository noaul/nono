import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { LOGIN_REDIRECT } from './services/api';
import { useClipStore } from './stores/clipStore';

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ code: 0, data }),
  } as Response);
}

function fail(status: number, message: string) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ code: status, message }),
  } as Response);
}

const clip = {
  id: 1,
  url: 'https://example.com/a',
  canonicalUrl: 'https://example.com/a',
  title: 'A clipped article',
  author: null,
  siteName: 'Example',
  domain: 'example.com',
  description: null,
  excerpt: 'An excerpt of the article',
  wordCount: 320,
  favicon: null,
  image: null,
  publishedAt: null,
  status: 'unread' as const,
  starred: false,
  extractor: 'defuddle',
  contentTruncated: false,
  contentVersion: 1,
  linkId: null,
  clippedAt: '2026-08-15T00:00:00.000Z',
};

function resetStore() {
  useClipStore.setState({
    items: [], total: 0, offset: 0, loading: false, error: null,
    filters: {}, query: '', searching: false, searchResults: null,
    tags: [], openClip: null, openLoading: false,
  });
}

describe('Clipper app', () => {
  beforeEach(() => {
    resetStore();
  });

  it('lists clips without loading their bodies', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => { void input; return ok({ items: [clip], total: 1, limit: 30, offset: 0 }); });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('A clipped article')).toBeInTheDocument();
    expect(screen.getByText('An excerpt of the article')).toBeInTheDocument();
    // The list endpoint is the only call; detail is deferred until the reader opens.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/clipper/clips');
  });

  it('shows an empty state rather than a blank pane', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({ items: [], total: 0, limit: 30, offset: 0 })));

    render(<App />);

    expect(await screen.findByText(/还没有剪藏/)).toBeInTheDocument();
  });

  it('surfaces an API error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => fail(500, 'Database is down')));

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Database is down');
  });

  it('redirects to login when the session has expired', async () => {
    vi.stubGlobal('fetch', vi.fn(() => fail(401, 'Authentication required')));
    const location = { href: '' };
    vi.stubGlobal('location', location as Location);

    render(<App />);

    await waitFor(() => expect(location.href).toBe(LOGIN_REDIRECT));
  });

  it('loads the full body only when a clip is opened', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/clipper/clips/1')) {
        return ok({ ...clip, contentHtml: '<p>Full body</p>', contentMd: 'Full body', tags: [], highlights: [] });
      }
      if (url.includes('/api/clipper/clips')) return ok({ items: [clip], total: 1, limit: 30, offset: 0 });
      return ok({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await userEvent.click(await screen.findByText('A clipped article'));

    await waitFor(() => {
      const frame = document.querySelector('iframe');
      expect(frame?.getAttribute('srcdoc')).toContain('Full body');
    });
  });

  it('filters by status', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => { void input; return ok({ items: [], total: 0, limit: 30, offset: 0 }); });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await screen.findByText(/还没有剪藏/);
    await userEvent.click(screen.getByRole('tab', { name: '已归档' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=archived'))).toBe(true);
    });
  });

  it('remembers the list or compact view across mounts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({ items: [clip], total: 1, limit: 30, offset: 0 })));

    const { unmount } = render(<App />);
    await screen.findByText('A clipped article');
    await userEvent.click(screen.getByRole('button', { name: '切换到紧凑视图' }));
    expect(window.localStorage.getItem('nono.clipper.view')).toBe('compact');
    unmount();

    expect(useClipStore.getState().view).toBe('compact');
  });

  it('searches from the search pane', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/api/clipper/search')) return ok({ items: [clip], query: '剪藏', limit: 30, offset: 0 });
      return ok({ items: [], total: 0, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '搜索' }));
    await userEvent.type(screen.getByLabelText('搜索剪藏'), '剪藏');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/clipper/search'))).toBe(true);
    });
  });

  it('creates a tag from the tag pane', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/clipper/tags') && init?.method === 'POST') {
        return ok({ id: 1, name: 'Reading', normalizedName: 'reading', color: null });
      }
      if (String(input).includes('/api/clipper/tags')) return ok([]);
      return ok({ items: [], total: 0, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '标签' }));
    await userEvent.type(await screen.findByLabelText('新建标签'), 'Reading');
    await userEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'POST')).toBe(true);
    });
  });
});
