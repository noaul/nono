import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Highlighter, Minus, Moon, MoveHorizontal, MoveVertical, Plus, Sun, X } from 'lucide-react';
import { SandboxedArticle } from '../components/SandboxedArticle';
import { articleTextFromHtml } from '../components/articleText';
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

  const resolved = useMemo(() => {
    if (!clip) return [];
    // Highlights are matched against the plain text of the current body, so a rewritten article
    // surfaces them as stale rather than attaching them to the wrong sentence.
    const text = articleTextFromHtml(clip.contentHtml || '');
    // Defensive: a detail payload without highlights must not white-screen the reader.
    return (clip.highlights || []).map((highlight) => resolveHighlight(text, highlight, clip.contentVersion));
  }, [clip]);

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
        <div className="reader-title-block">
          <h1>{clip.title}</h1>
          <p className="reader-meta">
            {[clip.siteName || clip.domain, clip.author, clip.wordCount ? `${clip.wordCount} 字` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="reader-controls">
          <button type="button" className="icon-button" aria-label="缩小字号" onClick={() => setPreferences((value) => ({ ...value, fontScale: Math.max(0.8, value.fontScale - 0.1) }))}>
            <Minus size={15} />
          </button>
          <button type="button" className="icon-button" aria-label="放大字号" onClick={() => setPreferences((value) => ({ ...value, fontScale: Math.min(1.6, value.fontScale + 0.1) }))}>
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={measure === 'narrow' ? '加宽版面' : '收窄版面'}
            onClick={() => setPreferences((value) => ({ ...value, measure: value.measure === 'narrow' ? 'wide' : 'narrow' }))}
          >
            {measure === 'narrow' ? <MoveHorizontal size={15} /> : <MoveVertical size={15} />}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'}
            onClick={() => setPreferences((value) => ({ ...value, theme: value.theme === 'light' ? 'dark' : 'light' }))}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <a className="icon-button" href={clip.url} target="_blank" rel="noopener noreferrer" aria-label="打开原文">
            <ExternalLink size={15} />
          </a>
          <button type="button" className="icon-button" aria-label="关闭" onClick={closeReader}>
            <X size={16} />
          </button>
        </div>
      </header>

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

      <SandboxedArticle
        html={clip.contentHtml}
        fontScale={fontScale}
        measure={measure}
        theme={theme}
        highlightRanges={highlightRanges}
        onSelect={setPending}
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
