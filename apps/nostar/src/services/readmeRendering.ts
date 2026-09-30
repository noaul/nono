/** Engines remain outside the README and application entry chunks. */
const MAX_SOURCE_LENGTH = 50_000;
const mathCache = new Map<string, string>();
const diagramCache = new Map<string, string>();
let diagramSequence = 0;

interface RenderOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function abortError() {
  return new DOMException('Rendering cancelled', 'AbortError');
}

function bounded<T>(work: Promise<T>, { signal, timeoutMs = 10_000 }: RenderOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const abort = () => finish(() => reject(abortError()));
    const timer = setTimeout(() => finish(() => reject(new Error('Rendering timed out'))), timeoutMs);
    function finish(callback: () => void) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      callback();
    }
    signal?.addEventListener('abort', abort, { once: true });
    work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

function cacheResult(cache: Map<string, string>, key: string, value: string) {
  if (cache.size >= 40) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

export async function renderMath(source: string, display: boolean, options: RenderOptions = {}): Promise<string> {
  if (options.signal?.aborted) throw abortError();
  if (source.length > MAX_SOURCE_LENGTH) throw new Error('Formula too large');
  const key = `${display}:${source}`;
  const cached = mathCache.get(key);
  if (cached) return cached;
  const html = await bounded((async () => {
    const [{ default: katex }] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
    return katex.renderToString(source, {
      displayMode: display, throwOnError: true, trust: false, strict: 'error', maxExpand: 1000,
    });
  })(), options);
  if (options.signal?.aborted) throw abortError();
  cacheResult(mathCache, key, html);
  return html;
}

function unsafeCss(value: string): boolean {
  if (/@import|expression\s*\(|javascript\s*:|\\/i.test(value)) return true;
  return [...value.matchAll(/url\s*\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^['"]|['"]$/g, '').startsWith('#'));
}

export async function sanitizeDiagramSvg(source: string): Promise<string> {
  const { default: purifier } = await import('dompurify');
  const clean = purifier.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['use'],
    FORBID_TAGS: ['script', 'foreignObject', 'image', 'animate', 'animateMotion', 'animateTransform', 'set'],
  });
  const document = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const svg = document.documentElement;
  if (svg.localName !== 'svg' || document.querySelector('parsererror')) throw new Error('Invalid diagram output');
  for (const element of svg.querySelectorAll('*')) {
    if (element.localName === 'a') {
      element.replaceWith(...element.childNodes);
      continue;
    }
    if (element.localName === 'style' && unsafeCss(element.textContent ?? '')) {
      element.remove();
      continue;
    }
    for (const attr of [...element.attributes]) {
      if (/^on/i.test(attr.name) || (/^(href|xlink:href)$/i.test(attr.name) && !attr.value.startsWith('#')) || unsafeCss(attr.value)) {
        element.removeAttribute(attr.name);
      }
    }
  }
  for (const attr of [...svg.attributes]) {
    if (/^on/i.test(attr.name) || unsafeCss(attr.value)) svg.removeAttribute(attr.name);
  }
  return new XMLSerializer().serializeToString(svg);
}

/** Cached SVG IDs are namespaced per mount so identical diagrams cannot share definitions. */
function freshDiagramIds(source: string): string {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  const prefix = `nostar-diagram-${++diagramSequence}`;
  const ids = new Map<string, string>();
  const elements = [...document.querySelectorAll('*')];
  for (const element of elements) {
    const id = element.getAttribute('id');
    if (id && !ids.has(id)) ids.set(id, `${prefix}-${id}`);
  }
  for (const element of elements) {
    const originalId = element.getAttribute('id');
    if (originalId) element.setAttribute('id', ids.get(originalId)!);
    if (element.localName === 'style') {
      element.textContent = (element.textContent ?? '').replace(/#([\w:-]+)/g, (match, id: string) => ids.has(id) ? `#${ids.get(id)}` : match);
    }
    for (const attr of [...element.attributes]) {
      if (attr.name === 'id') continue;
      if (/^(href|xlink:href)$/.test(attr.name) && attr.value.startsWith('#')) {
        const id = ids.get(attr.value.slice(1));
        if (id) element.setAttribute(attr.name, `#${id}`);
      } else if (/^aria-(labelledby|describedby)$/.test(attr.name)) {
        element.setAttribute(attr.name, attr.value.split(/\s+/).map(id => ids.get(id) ?? id).join(' '));
      } else {
        element.setAttribute(attr.name, attr.value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (match, _quote: string, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : match));
      }
    }
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}

export async function renderDiagram(source: string, options: RenderOptions = {}): Promise<string> {
  if (options.signal?.aborted) throw abortError();
  if (source.length > MAX_SOURCE_LENGTH) throw new Error('Diagram too large');
  // Per-diagram configuration is untrusted, including YAML frontmatter and legacy init directives.
  if (/%%\s*\{|^\s*---(?:\r?\n|$)/m.test(source)) throw new Error('Diagram configuration is not allowed');
  const cached = diagramCache.get(source);
  if (cached) return freshDiagramIds(cached);
  const id = `nostar-diagram-render-${++diagramSequence}`;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(host);
  try {
    const svg = await bounded((async () => {
      const { default: mermaid } = await import('mermaid');
      if (options.signal?.aborted) throw abortError();
      mermaid.initialize({
        startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, htmlLabels: false,
        maxTextSize: MAX_SOURCE_LENGTH, maxEdges: 500,
        flowchart: { htmlLabels: false }, theme: 'neutral',
      });
      const result = await mermaid.render(id, source, host);
      return sanitizeDiagramSvg(result.svg);
    })(), options);
    if (options.signal?.aborted) throw abortError();
    cacheResult(diagramCache, source, svg);
    return freshDiagramIds(svg);
  } finally {
    host.remove();
  }
}
