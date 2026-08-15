import { useEffect, useMemo } from 'react';
import { LayoutList, RefreshCw, Rows3, Star, Trash2 } from 'lucide-react';
import { useClipStore } from '../stores/clipStore';
import type { ClipStatus } from '../services/api';

const STATUSES: Array<{ value: ClipStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'reading', label: '在读' },
  { value: 'archived', label: '已归档' },
];

export function ClipListView() {
  const items = useClipStore((state) => state.items);
  const total = useClipStore((state) => state.total);
  const loading = useClipStore((state) => state.loading);
  const error = useClipStore((state) => state.error);
  const filters = useClipStore((state) => state.filters);
  const tags = useClipStore((state) => state.tags);
  const view = useClipStore((state) => state.view);
  const loadClips = useClipStore((state) => state.loadClips);
  const loadMore = useClipStore((state) => state.loadMore);
  const setFilters = useClipStore((state) => state.setFilters);
  const setView = useClipStore((state) => state.setView);
  const loadTags = useClipStore((state) => state.loadTags);
  const openReader = useClipStore((state) => state.openReader);
  const toggleStar = useClipStore((state) => state.toggleStar);
  const removeClip = useClipStore((state) => state.removeClip);
  const refetch = useClipStore((state) => state.refetch);

  useEffect(() => {
    void loadClips(true);
  }, [loadClips]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const domains = useMemo(() => [...new Set([
    ...(filters.domain ? [filters.domain] : []),
    ...items.map((item) => item.domain).filter(Boolean),
  ])].sort(), [filters.domain, items]);

  return (
    <section className="clip-list" aria-busy={loading}>
      <header className="clip-list-header">
        <div className="filter-row" role="tablist" aria-label="状态">
          {STATUSES.map((status) => (
            <button
              key={status.value}
              type="button"
              role="tab"
              aria-selected={(filters.status ?? 'all') === status.value}
              className={`filter-chip${(filters.status ?? 'all') === status.value ? ' is-active' : ''}`}
              onClick={() => void setFilters({
                ...filters,
                status: status.value === 'all' ? undefined : (status.value as ClipStatus),
              })}
            >
              {status.label}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip${filters.starred ? ' is-active' : ''}`}
            aria-pressed={Boolean(filters.starred)}
            onClick={() => void setFilters({ ...filters, starred: filters.starred ? undefined : true })}
          >
            星标
          </button>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={view === 'list' ? '切换到紧凑视图' : '切换到列表视图'}
          onClick={() => setView(view === 'list' ? 'compact' : 'list')}
        >
            {view === 'list' ? <Rows3 size={16} /> : <LayoutList size={16} />}
          </button>
      </header>

      <div className="filter-selects">
        <label>
          <span className="visually-hidden">按标签筛选</span>
          <select
            aria-label="按标签筛选"
            value={filters.tagId ?? ''}
            onChange={(event) => void setFilters({
              ...filters,
              tagId: event.target.value ? Number(event.target.value) : undefined,
            })}
          >
            <option value="">全部标签</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
        </label>
        <label>
          <span className="visually-hidden">按域名筛选</span>
          <select
            aria-label="按域名筛选"
            value={filters.domain ?? ''}
            onChange={(event) => void setFilters({ ...filters, domain: event.target.value || undefined })}
          >
            <option value="">全部域名</option>
            {domains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
          </select>
        </label>
      </div>

      {error ? <p className="state-message is-error" role="alert">{error}</p> : null}

      {!loading && items.length === 0 && !error ? (
        <p className="state-message">还没有剪藏。用 Chrome 扩展剪藏一个页面后会出现在这里。</p>
      ) : null}

      <ul className={`clip-items is-${view}`}>
        {items.map((clip) => (
          <li key={clip.id} className="clip-item">
            <button type="button" className="clip-open" onClick={() => void openReader(clip.id)}>
              <span className="clip-title">{clip.title}</span>
              <span className="clip-domain">{clip.domain}</span>
              {view === 'list' ? <span className="clip-excerpt">{clip.excerpt}</span> : null}
              <span className="clip-meta">
                {clip.wordCount ? `${clip.wordCount} 字` : null}
                {clip.contentTruncated ? ' · 已截断' : null}
                {clip.status === 'archived' ? ' · 已归档' : null}
              </span>
            </button>
            <div className="clip-actions">
              <button
                type="button"
                className="icon-button"
                aria-label="星标"
                aria-pressed={clip.starred}
                onClick={() => void toggleStar(clip.id)}
              >
                <Star size={15} fill={clip.starred ? 'currentColor' : 'none'} />
              </button>
              <button type="button" className="icon-button" aria-label="重新抓取" onClick={() => void refetch(clip.id)}>
                <RefreshCw size={15} />
              </button>
              <button type="button" className="icon-button" aria-label="删除" onClick={() => void removeClip(clip.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {items.length < total ? (
        <button type="button" className="load-more" onClick={() => void loadMore()} disabled={loading}>
          {loading ? '加载中...' : `加载更多（${items.length}/${total}）`}
        </button>
      ) : null}
    </section>
  );
}
