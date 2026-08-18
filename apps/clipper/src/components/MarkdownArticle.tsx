import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ArticleHighlightRange } from './SandboxedArticle';

interface MarkdownArticleProps {
  markdown: string;
  fontScale?: number;
  measure?: 'narrow' | 'wide';
  theme?: 'light' | 'dark';
  highlightRanges?: ArticleHighlightRange[];
  onSelect?: (selection: { text: string; startOffset: number; fullText: string }) => void;
  onTextChange?: (text: string) => void;
}

export function MarkdownArticle({
  markdown,
  fontScale = 1,
  measure = 'narrow',
  theme = 'light',
  highlightRanges = [],
  onSelect,
  onTextChange,
}: MarkdownArticleProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentKey = useMemo(
    () => `${markdown}\u0000${highlightRanges.map((range) => `${range.id}:${range.start}:${range.end}:${range.color}`).join('|')}`,
    [highlightRanges, markdown],
  );

  useLayoutEffect(() => {
    onTextChange?.(rootRef.current?.textContent || '');
  }, [markdown, onTextChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (root) applyHighlightRanges(root, highlightRanges);
  }, [contentKey, highlightRanges]);

  const captureSelection = () => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !onSelect || !selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!containsRange(root, range)) return;
    const text = range.toString();
    if (!text.trim()) return;
    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    onSelect({ text, startOffset: prefix.toString().length, fullText: root.textContent || '' });
  };

  return (
    <article
      ref={rootRef}
      className="markdown-article"
      data-measure={measure}
      data-theme={theme}
      style={{ fontSize: `${Math.round(16 * fontScale)}px` }}
      onMouseUp={captureSelection}
      onTouchEnd={captureSelection}
    >
      <div key={contentKey} className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ node, ...props }) => {
              void node;
              return <a {...props} target="_blank" rel="noopener noreferrer" />;
            },
            img: ({ node, ...props }) => {
              void node;
              return <img {...props} loading="lazy" referrerPolicy="no-referrer" />;
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </article>
  );
}

function containsRange(root: HTMLElement, range: Range) {
  const start = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
  const end = range.endContainer.nodeType === 3 ? range.endContainer.parentNode : range.endContainer;
  return Boolean(start && end && root.contains(start) && root.contains(end));
}

function applyHighlightRanges(root: HTMLElement, ranges: ArticleHighlightRange[]) {
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
