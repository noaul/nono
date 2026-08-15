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
  onSelect?: (selection: { text: string; startOffset: number; fullText: string }) => void;
}

const READER_CSS = `
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 24px 20px 64px;
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #1c1c1e;
    background: transparent;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  body[data-theme="dark"] { color: #e6e6ea; }
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
  a { color: #167d86; }
  body[data-theme="dark"] a { color: #6ad2db; }
  h1,h2,h3,h4 { line-height: 1.3; }
`;

export function SandboxedArticle({
  html,
  fontScale = 1,
  measure = 'narrow',
  theme = 'light',
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

      if (!onSelect) return;
      const handler = () => {
        const selection = doc.getSelection();
        const text = selection?.toString() ?? '';
        if (!text.trim()) return;
        const fullText = doc.body.textContent || '';
        onSelect({ text, startOffset: fullText.indexOf(text), fullText });
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
  }, [srcDoc, onSelect]);

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
