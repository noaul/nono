import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { renderDiagram, renderMath } from '../services/readmeRendering';

interface RenderedSource { key: string; html?: string; failed?: boolean }

function useRenderedSource(source: string, kind: 'diagram' | 'inline' | 'display') {
  const key = `${kind}:${source}`;
  const [result, setResult] = useState<RenderedSource>({ key: '' });
  useEffect(() => {
    const controller = new AbortController();
    const work = kind === 'diagram'
      ? renderDiagram(source, { signal: controller.signal })
      : renderMath(source, kind === 'display', { signal: controller.signal });
    work.then(html => {
      if (!controller.signal.aborted) setResult({ key, html });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, failed: true });
    });
    return () => controller.abort();
  }, [source, kind, key]);
  return result.key === key ? result : { key };
}

export function MarkdownMath({ source, display }: { source: string; display: boolean }) {
  const result = useRenderedSource(source, display ? 'display' : 'inline');
  const raw = display ? `$$\n${source}\n$$` : `$${source}$`;
  return result.html
    ? <span className={`markdown-math ${display ? 'markdown-math-display' : ''}`} data-translate="false" dangerouslySetInnerHTML={{ __html: result.html }} />
    : <span className={`markdown-math-source ${display ? 'markdown-math-display' : ''}`} data-translate="false">{raw}</span>;
}

export function MarkdownDiagram({ source, fallback }: { source: string; fallback: ReactNode }) {
  const result = useRenderedSource(source, 'diagram');
  const language = useAppStore(state => state.language);
  return <div className="markdown-diagram" data-translate="false">
    {result.html ? <>
      <div className="markdown-diagram-output" role="img" aria-label="Mermaid diagram" dangerouslySetInnerHTML={{ __html: result.html }} />
      <details className="markdown-diagram-source"><summary>{language === 'zh' ? 'Mermaid 源码' : 'Mermaid source'}</summary>{fallback}</details>
    </> : <>
      {result.failed && <p className="markdown-diagram-error" role="status">{language === 'zh' ? '图表暂时无法显示，下方保留 Mermaid 源码。' : 'Diagram unavailable. Mermaid source is shown below.'}</p>}
      {fallback}
    </>}
  </div>;
}
