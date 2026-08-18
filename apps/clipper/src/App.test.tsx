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
    window.history.replaceState({}, '', '/clipper/');
  });

  it('lists clips without loading their bodies', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => { void input; return ok({ items: [clip], total: 1, limit: 30, offset: 0 }); });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('A clipped article')).toBeInTheDocument();
    expect(screen.getByText('An excerpt of the article')).toBeInTheDocument();
    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requestedUrls).toContain('/api/clipper/clips?limit=30&offset=0');
    expect(requestedUrls).toContain('/api/clipper/tags');
    expect(requestedUrls.some((url) => /\/api\/clipper\/clips\/[^?]+/.test(url))).toBe(false);
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

    expect(await screen.findByText('Full body')).toBeInTheDocument();
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

  it('opens a clip addressed by the NoDesk search deep link', async () => {
    window.history.replaceState({}, '', '/clipper/?clip=1');
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/clipper/clips/1')) {
        return ok({ ...clip, contentHtml: '<p>Deep link body</p>', contentMd: 'Deep link body', tags: [], highlights: [] });
      }
      if (url.includes('/api/clipper/tags')) return ok([]);
      return ok({ items: [clip], total: 1, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Deep link body')).toBeInTheDocument();
  });

  it('shows the original source and clipping time in the list and reader', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/clipper/clips/1')) {
        return ok({ ...clip, contentHtml: '<p>Fallback</p>', contentMd: 'Body', tags: [], highlights: [] });
      }
      if (url.includes('/api/clipper/tags')) return ok([]);
      return ok({ items: [clip], total: 1, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('https://example.com/a')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('A clipped article'));

    expect(await screen.findByRole('link', { name: 'https://example.com/a' })).toHaveAttribute('href', 'https://example.com/a');
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });

  it('renders stored Markdown links and images instead of the HTML fallback', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/clipper/clips/1')) {
        return ok({
          ...clip,
          contentHtml: '<p>HTML fallback only</p>',
          contentMd: 'Read [reference](https://docs.example.com)\n\n![diagram](https://example.com/diagram.png)',
          tags: [],
          highlights: [],
        });
      }
      if (url.includes('/api/clipper/tags')) return ok([]);
      return ok({ items: [clip], total: 1, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await userEvent.click(await screen.findByText('A clipped article'));

    expect(await screen.findByRole('link', { name: 'reference' })).toHaveAttribute('href', 'https://docs.example.com');
    expect(screen.getByRole('img', { name: 'diagram' })).toHaveAttribute('src', 'https://example.com/diagram.png');
    expect(screen.queryByText('HTML fallback only')).not.toBeInTheDocument();
  });

  it('resolves highlights against the rendered Markdown text', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/clipper/clips/1')) {
        return ok({
          ...clip,
          contentHtml: '<p>Unrelated HTML fallback</p>',
          contentMd: 'Before **selected words** after.',
          tags: [],
          highlights: [{
            id: 7,
            clipId: 1,
            text: 'selected words',
            note: null,
            color: 'yellow',
            contentVersion: 1,
            anchor: {
              quote: 'selected words',
              prefix: 'Before ',
              suffix: ' after.',
              startOffset: 7,
              endOffset: 21,
            },
            createdAt: '2026-08-15T00:00:00.000Z',
          }],
        });
      }
      if (url.includes('/api/clipper/tags')) return ok([]);
      return ok({ items: [clip], total: 1, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await userEvent.click(await screen.findByText('A clipped article'));

    await waitFor(() => {
      expect(document.querySelector('mark[data-highlight-id="7"]')).toHaveTextContent('selected words');
    });
    expect(screen.queryByText(/标注无法在当前正文中定位/)).not.toBeInTheDocument();
  });

  it('filters clips by tag and domain', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/clipper/tags')) {
        return ok([{ id: 3, name: 'Reading', normalizedName: 'reading', color: '#ffcc00' }]);
      }
      return ok({ items: [clip], total: 1, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await screen.findByText('A clipped article');
    await userEvent.selectOptions(await screen.findByLabelText('按标签筛选'), '3');
    await userEvent.selectOptions(screen.getByLabelText('按域名筛选'), 'example.com');

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('tagId=3'))).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('domain=example.com'))).toBe(true);
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

  it('assigns a tag from the reader', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/clipper/tags')) {
        return ok([{ id: 3, name: 'Reading', normalizedName: 'reading', color: '#ffcc00' }]);
      }
      if (url.includes('/api/clipper/clips/1/tags') && init?.method === 'PUT') return ok({ assigned: 1 });
      if (url.includes('/api/clipper/clips/1')) {
        return ok({ ...clip, contentHtml: '<p>Full body</p>', contentMd: 'Full body', tags: [], highlights: [] });
      }
      return ok({ items: [clip], total: 1, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await userEvent.click(await screen.findByText('A clipped article'));
    await userEvent.click(await screen.findByRole('checkbox', { name: '标签 Reading' }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/clips/1/tags') && (init as RequestInit)?.method === 'PUT');
      expect(request).toBeDefined();
      expect(JSON.parse(String((request?.[1] as RequestInit).body))).toEqual({ tagIds: [3] });
    });
  });

  it('restores reader font, measure and theme preferences from local storage', async () => {
    window.localStorage.setItem('nono.clipper.reader', JSON.stringify({ fontScale: 1.3, measure: 'wide', theme: 'dark' }));
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/clipper/clips/1')) {
        return ok({ ...clip, contentHtml: '<p>Full body</p>', contentMd: 'Full body', tags: [], highlights: [] });
      }
      if (url.includes('/api/clipper/tags')) return ok([]);
      return ok({ items: [clip], total: 1, limit: 30, offset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await userEvent.click(await screen.findByText('A clipped article'));

    await waitFor(() => {
      const article = document.querySelector('.markdown-article') as HTMLElement | null;
      expect(article).toHaveStyle({ fontSize: '21px' });
      expect(article).toHaveAttribute('data-measure', 'wide');
      expect(article).toHaveAttribute('data-theme', 'dark');
    });
  });
});
