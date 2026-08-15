import { useMemo, useState } from 'react';
import { ExternalLink, Highlighter, Minus, Plus, X } from 'lucide-react';
import { SandboxedArticle } from '../components/SandboxedArticle';
import { buildAnchor, isStale, resolveHighlight } from '../components/highlightAnchor';
import { useClipStore } from '../stores/clipStore';

export function ReaderView() {
  const clip = useClipStore((state) => state.openClip);
  const closeReader = useClipStore((state) => state.closeReader);
  const addHighlight = useClipStore((state) => state.addHighlight);
  const removeHighlight = useClipStore((state) => state.removeHighlight);
  const setStatus = useClipStore((state) => state.setStatus);

  // Reader preferences are local only; they never modify the stored article.
  const [fontScale, setFontScale] = useState(1);
  const [measure, setMeasure] = useState<'narrow' | 'wide'>('narrow');
  const [pending, setPending] = useState<{ text: string; startOffset: number; fullText: string } | null>(null);

  const resolved = useMemo(() => {
    if (!clip) return [];
    // Highlights are matched against the plain text of the current body, so a rewritten article
    // surfaces them as stale rather than attaching them to the wrong sentence.
    const text = clip.contentMd || '';
    // Defensive: a detail payload without highlights must not white-screen the reader.
    return (clip.highlights || []).map((highlight) => resolveHighlight(text, highlight, clip.contentVersion));
  }, [clip]);

  if (!clip) return null;

  const staleCount = resolved.filter(isStale).length;

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
          <button type="button" className="icon-button" aria-label="缩小字号" onClick={() => setFontScale((value) => Math.max(0.8, value - 0.1))}>
            <Minus size={15} />
          </button>
          <button type="button" className="icon-button" aria-label="放大字号" onClick={() => setFontScale((value) => Math.min(1.6, value + 0.1))}>
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={measure === 'narrow' ? '加宽版面' : '收窄版面'}
            onClick={() => setMeasure(measure === 'narrow' ? 'wide' : 'narrow')}
          >
            {measure === 'narrow' ? '↔' : '↕'}
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
