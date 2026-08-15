import { useEffect, useMemo, useRef } from 'react';

/**
 * Renders clipped article HTML inside a sandboxed iframe.
 *
 * The HTML was sanitized server-side on ingest; this is the second layer. The sandbox deliberately
 * omits `allow-scripts`, so even markup that slipped past sanitization cannot execute. Styles come
 * from the parent, never from the clipped document.
 */

export interface SandboxedArticleProps {
  html: string;
  fontScale?: number;
  measure?: 'narrow' | 'wide';
  theme?: 'light' | 'dark';
  highlightRanges?: ArticleHighlightRange[];
  onSelect?: (selection: { text: string; startOffset: number; fullText: string }) => void;
}

export interface ArticleHighlightRange {
  id: number;
  start: number;
  end: number;
  color: string;
}

const READER_CSS = `
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 24px 20px 64px;
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #1c1c1e;
    background: #ffffff;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  body[data-theme="dark"] { color: #e6e6ea; background: #18181b; }
  .article { margin: 0 auto; }
  body[data-measure="narrow"] .article { max-width: 680px; }
  body[data-measure="wide"] .article { max-width: 100%; }
  img, figure, table, pre { max-width: 100%; }
  img { height: auto; border-radius: 8px; }
  pre { overflow-x: auto; padding: 12px; border-radius: 8px; background: rgba(120,120,128,0.12); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
  table { border-collapse: collapse; display: block; overflow-x: auto; }
  th, td { border: 1px solid rgba(120,120,128,0.35); padding: 6px 10px; }
  blockquote { margin: 1em 0; padding-left: 14px; border-left: 3px solid rgba(120,120,128,0.4); opacity: .9; }
  mark[data-highlight-id] { border-radius: 2px; color: inherit; padding: 0 .04em; }
  mark[data-highlight-color="yellow"] { background: #ffe58f; }
  mark[data-highlight-color="green"] { background: #b7eb8f; }
  mark[data-highlight-color="blue"] { background: #91d5ff; }
  mark[data-highlight-color="pink"] { background: #ffadd2; }
  mark[data-highlight-color="purple"] { background: #d3adf7; }
  body[data-theme="dark"] mark[data-highlight-id] { color: #1c1c1e; }
  a { color: #167d86; }
  body[data-theme="dark"] a { color: #6ad2db; }
  h1,h2,h3,h4 { line-height: 1.3; }
`;

export function SandboxedArticle({
  html,
  fontScale = 1,
  measure = 'narrow',
  theme = 'light',
  highlightRanges = [],
  onSelect,
}: SandboxedArticleProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  const srcDoc = useMemo(() => `<!doctype html>
<html><head><meta charset="utf-8" />
<style>${READER_CSS}</style>
<style>body { font-size: ${Math.round(16 * fontScale)}px; }</style>
</head>
<body data-theme="${theme}" data-measure="${measure}"><div class="article">${html}</div></body></html>`,
  [html, fontScale, measure, theme]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc) return;

      // External links must leave the sandbox rather than replace the reader.
      for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      }

      const article = doc.querySelector<HTMLElement>('.article');
      if (article) applyHighlightRanges(article, highlightRanges);

      if (!onSelect) return;
      const handler = () => {
        const selection = doc.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !article) return;
        const range = selection.getRangeAt(0);
        if (!containsRange(article, range)) return;
        const text = range.toString();
        if (!text.trim()) return;
        const prefixRange = doc.createRange();
        prefixRange.selectNodeContents(article);
        prefixRange.setEnd(range.startContainer, range.startOffset);
        onSelect({ text, startOffset: prefixRange.toString().length, fullText: article.textContent || '' });
      };
      doc.addEventListener('mouseup', handler);
      doc.addEventListener('touchend', handler);
      return () => {
        doc.removeEventListener('mouseup', handler);
        doc.removeEventListener('touchend', handler);
      };
    };

    let detach: (() => void) | undefined;
    const onLoad = () => { detach = attach(); };
    frame.addEventListener('load', onLoad);
    if (frame.contentDocument?.readyState === 'complete') detach = attach();
    return () => {
      frame.removeEventListener('load', onLoad);
      detach?.();
    };
  }, [srcDoc, highlightRanges, onSelect]);

  return (
    <iframe
      ref={frameRef}
      className="clip-article-frame"
      title="clip-article"
      // No allow-scripts, deliberately. allow-same-origin is needed to read the selection for
      // highlighting; allow-popups lets external links open in a new tab.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
    />
  );
}

function containsRange(root: HTMLElement, range: Range) {
  const start = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
  const end = range.endContainer.nodeType === 3 ? range.endContainer.parentNode : range.endContainer;
  return Boolean(start && end && root.contains(start) && root.contains(end));
}

function applyHighlightRanges(root: HTMLElement, ranges: ArticleHighlightRange[]) {
  for (const mark of Array.from(root.querySelectorAll('mark[data-highlight-id]'))) {
    mark.replaceWith(...Array.from(mark.childNodes));
  }
  root.normalize();

  const normalized = ranges
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  if (!normalized.length) return;

  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  let cursor = 0;
  for (const node of nodes) {
    const value = node.data;
    const nodeStart = cursor;
    const nodeEnd = nodeStart + value.length;
    cursor = nodeEnd;
    const matching = normalized.filter((range) => range.start < nodeEnd && range.end > nodeStart);
    if (!matching.length) continue;

    const boundaries = new Set([0, value.length]);
    for (const range of matching) {
      boundaries.add(Math.max(0, range.start - nodeStart));
      boundaries.add(Math.min(value.length, range.end - nodeStart));
    }
    const ordered = [...boundaries].sort((left, right) => left - right);
    const fragment = doc.createDocumentFragment();
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const start = ordered[index];
      const end = ordered[index + 1];
      if (end <= start) continue;
      const segmentStart = nodeStart + start;
      const active = matching.find((range) => range.start <= segmentStart && range.end >= nodeStart + end);
      const text = doc.createTextNode(value.slice(start, end));
      if (!active) {
        fragment.appendChild(text);
        continue;
      }
      const mark = doc.createElement('mark');
      mark.dataset.highlightId = String(active.id);
      mark.dataset.highlightColor = active.color;
      mark.appendChild(text);
      fragment.appendChild(mark);
    }
    node.replaceWith(fragment);
  }
}
