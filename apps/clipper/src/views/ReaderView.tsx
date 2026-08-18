import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, ExternalLink, Highlighter, Minus, Moon, MoveHorizontal, MoveVertical, Plus, Sun } from 'lucide-react';
import { MarkdownArticle } from '../components/MarkdownArticle';
import { buildAnchor, isStale, resolveHighlight } from '../components/highlightAnchor';
import { useClipStore } from '../stores/clipStore';

export function ReaderView() {
  const clip = useClipStore((state) => state.openClip);
  const tags = useClipStore((state) => state.tags);
  const closeReader = useClipStore((state) => state.closeReader);
  const addHighlight = useClipStore((state) => state.addHighlight);
  const removeHighlight = useClipStore((state) => state.removeHighlight);
  const setStatus = useClipStore((state) => state.setStatus);
  const loadTags = useClipStore((state) => state.loadTags);
  const assignTags = useClipStore((state) => state.assignTags);

  // Reader preferences are local only; they never modify the stored article.
  const [preferences, setPreferences] = useState(readStoredPreferences);
  const [pending, setPending] = useState<{ text: string; startOffset: number; fullText: string } | null>(null);
  const [renderedText, setRenderedText] = useState<{
    clipId: number;
    contentVersion: number;
    text: string;
  } | null>(null);
  const clipId = clip?.id;
  const clipContentVersion = clip?.contentVersion;
  const { fontScale, measure, theme } = preferences;

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  useEffect(() => {
    try {
      window.localStorage.setItem(READER_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Browser privacy settings may block storage; the in-memory controls still work.
    }
  }, [preferences]);

  const captureRenderedText = useCallback((text: string) => {
    if (clipId == null || clipContentVersion == null) return;
    setRenderedText((current) => (
      current?.clipId === clipId && current.contentVersion === clipContentVersion && current.text === text
        ? current
        : { clipId, contentVersion: clipContentVersion, text }
    ));
  }, [clipContentVersion, clipId]);

  const resolved = useMemo(() => {
    if (!clip) return [];
    const text = renderedText?.clipId === clip.id && renderedText.contentVersion === clip.contentVersion
      ? renderedText.text
      : null;
    if (text == null) return [];
    // Defensive: a detail payload without highlights must not white-screen the reader.
    return (clip.highlights || []).map((highlight) => resolveHighlight(text, highlight, clip.contentVersion));
  }, [clip, renderedText]);

  const highlightRanges = useMemo(() => resolved.flatMap((entry) => isStale(entry)
    ? []
    : [{
      id: entry.highlight.id,
      start: entry.start,
      end: entry.end,
      color: entry.highlight.color,
    }]), [resolved]);

  if (!clip) return null;

  const staleCount = resolved.filter(isStale).length;
  const assignedTagIds = new Set((clip.tags || []).map((entry) => entry.tag.id));

  return (
    <section className="reader" aria-label={clip.title}>
      <header className="reader-header">
        <button type="button" className="reader-back" onClick={closeReader}>
          <ArrowLeft size={15} /> 返回列表
        </button>
        <div className="reader-title-block">
          <h1>{clip.title}</h1>
          <p className="reader-meta">
            {[clip.siteName || clip.domain, clip.author, clip.wordCount ? `${clip.wordCount} 字` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="reader-controls">
          <button type="button" className="icon-button" aria-label="缩小字号" title="缩小字号" onClick={() => setPreferences((value) => ({ ...value, fontScale: Math.max(0.8, value.fontScale - 0.1) }))}>
            <Minus size={15} />
          </button>
          <button type="button" className="icon-button" aria-label="放大字号" title="放大字号" onClick={() => setPreferences((value) => ({ ...value, fontScale: Math.min(1.6, value.fontScale + 0.1) }))}>
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={measure === 'narrow' ? '加宽版面' : '收窄版面'}
            title={measure === 'narrow' ? '加宽版面' : '收窄版面'}
            onClick={() => setPreferences((value) => ({ ...value, measure: value.measure === 'narrow' ? 'wide' : 'narrow' }))}
          >
            {measure === 'narrow' ? <MoveHorizontal size={15} /> : <MoveVertical size={15} />}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'}
            title={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'}
            onClick={() => setPreferences((value) => ({ ...value, theme: value.theme === 'light' ? 'dark' : 'light' }))}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
        </div>
      </header>

      <div className="reader-provenance">
        <a href={clip.url} target="_blank" rel="noopener noreferrer" title={clip.url}>
          <ExternalLink size={13} aria-hidden="true" />
          <span>{clip.url}</span>
        </a>
        <time dateTime={clip.clippedAt}>
          <CalendarClock size={13} aria-hidden="true" />
          剪藏于 {formatClipTimestamp(clip.clippedAt)}
        </time>
      </div>

      {clip.description ? <p className="reader-summary">{clip.description}</p> : null}

      {clip.contentTruncated ? (
        <p className="state-message">正文已按体积上限截断，完整内容请打开原文。</p>
      ) : null}

      {tags.length > 0 ? (
        <div className="reader-tags" aria-label="文章标签">
          {tags.map((tag) => {
            const checked = assignedTagIds.has(tag.id);
            return (
              <label key={tag.id} className={checked ? 'is-selected' : undefined}>
                <input
                  type="checkbox"
                  aria-label={`标签 ${tag.name}`}
                  checked={checked}
                  onChange={(event) => void assignTags(
                    clip.id,
                    event.target.checked
                      ? [...assignedTagIds, tag.id]
                      : [...assignedTagIds].filter((id) => id !== tag.id),
                  )}
                />
                <span className="tag-color" style={{ backgroundColor: tag.color || '#8e8e93' }} />
                <span>{tag.name}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      {pending ? (
        <div className="highlight-prompt" role="dialog" aria-label="添加标注">
          <p className="highlight-quote">{pending.text.slice(0, 160)}</p>
          <div className="highlight-actions">
            <button
              type="button"
              onClick={() => {
                void addHighlight(clip.id, {
                  text: pending.text,
                  anchor: buildAnchor(pending.fullText, pending.text, pending.startOffset),
                });
                setPending(null);
              }}
            >
              <Highlighter size={14} /> 标注
            </button>
            <button type="button" className="text-button" onClick={() => setPending(null)}>取消</button>
          </div>
        </div>
      ) : null}

      <MarkdownArticle
        markdown={clip.contentMd || clip.description || ''}
        fontScale={fontScale}
        measure={measure}
        theme={theme}
        highlightRanges={highlightRanges}
        onSelect={setPending}
        onTextChange={captureRenderedText}
      />

      <aside className="highlight-list" aria-label="标注">
        <h2>标注（{(clip.highlights || []).length}）</h2>
        {staleCount > 0 ? (
          <p className="state-message">
            {staleCount} 条标注无法在当前正文中定位，可能是重新抓取后原文已改动。
          </p>
        ) : null}
        <ul>
          {resolved.map((entry) => (
            <li key={entry.highlight.id} className={isStale(entry) ? 'is-stale' : undefined}>
              <blockquote>{entry.highlight.text.slice(0, 200)}</blockquote>
              {isStale(entry) ? <span className="stale-badge">已失效</span> : null}
              <button
                type="button"
                className="text-button"
                onClick={() => void removeHighlight(entry.highlight.id)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <footer className="reader-footer">
        <button type="button" className="text-button" onClick={() => void setStatus(clip.id, 'archived')}>
          归档
        </button>
      </footer>
    </section>
  );
}

function formatClipTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

const READER_STORAGE_KEY = 'nono.clipper.reader';

interface ReaderPreferences {
  fontScale: number;
  measure: 'narrow' | 'wide';
  theme: 'light' | 'dark';
}

function readStoredPreferences(): ReaderPreferences {
  try {
    const stored = JSON.parse(window.localStorage.getItem(READER_STORAGE_KEY) || '{}') as Partial<ReaderPreferences>;
    return {
      fontScale: typeof stored.fontScale === 'number' && stored.fontScale >= 0.8 && stored.fontScale <= 1.6
        ? stored.fontScale
        : 1,
      measure: stored.measure === 'wide' ? 'wide' : 'narrow',
      theme: stored.theme === 'dark' ? 'dark' : 'light',
    };
  } catch {
    return { fontScale: 1, measure: 'narrow', theme: 'light' };
  }
}
