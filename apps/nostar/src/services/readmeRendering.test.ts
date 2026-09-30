import { describe, expect, it, vi } from 'vitest';
import { renderDiagram, renderMath, sanitizeDiagramSvg } from './readmeRendering';

const engine = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock('mermaid', () => ({ default: engine }));

describe('README rendering safety and failures', () => {
  it('sanitizes SVG scripting, foreign HTML, remote references, and CSS requests while retaining diagram shapes', async () => {
    const svg = await sanitizeDiagramSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><img onerror="alert(1)" /></foreignObject><a href="javascript:alert(1)"><text>bad</text></a><image href="https://evil.test/pixel"/><path onclick="alert(1)" d="M0 0L1 1"/><use href="#local"/><use href="https://evil.test/svg"/><style>@import "https://evil.test"; .node{fill:url(https://evil.test)}</style></svg>');
    const host = document.createElement('div');
    host.innerHTML = svg;
    expect(host.querySelector('script, foreignObject, a, image, [onclick]')).toBeNull();
    expect(svg).not.toContain('evil.test');
    expect(host.querySelector('path')).toHaveAttribute('d', 'M0 0L1 1');
    expect(host.querySelector('use')).toHaveAttribute('href', '#local');
  });

  it('rejects malformed SVG output', async () => {
    await expect(sanitizeDiagramSvg('<p>no diagram</p>')).rejects.toThrow();
  });

  it('renders diagrams through strict security and caches only sanitized successful output', async () => {
    engine.render.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Start</text></svg>' });
    const result = await renderDiagram('graph TD; CacheA --> CacheB');
    expect(result).toContain('<text>Start</text>');
    expect(engine.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: 'strict', startOnLoad: false, htmlLabels: false }));
  });

  it('gives cached diagram definitions unique IDs and keeps their references connected', async () => {
    engine.render.mockResolvedValueOnce({ svg: '<svg xmlns="http://www.w3.org/2000/svg" id="chart"><defs><marker id="arrow"><path d="M0 0L1 1"/></marker></defs><path marker-end="url(#arrow)"/><style>#chart text{fill:black}</style><text>Diagram</text></svg>' });
    const first = await renderDiagram('graph TD; UniqueA --> UniqueB');
    const second = await renderDiagram('graph TD; UniqueA --> UniqueB');
    const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');
    const firstDoc = parse(first);
    const secondDoc = parse(second);
    const marker = secondDoc.querySelector('marker')!;
    expect(firstDoc.querySelector('marker')!.id).not.toBe(marker.id);
    expect(secondDoc.querySelector('[marker-end]')?.getAttribute('marker-end')).toBe(`url(#${marker.id})`);
    expect(secondDoc.querySelector('style')?.textContent).toContain(`#${secondDoc.documentElement.getAttribute('id')} text`);
  });

  it('rejects configuration directives that could weaken diagram security', async () => {
    await expect(renderDiagram('%%{init: {securityLevel: "loose"}}%%\ngraph TD; A-->B')).rejects.toThrow();
  });

  it('bounds a hung diagram render', async () => {
    engine.render.mockReturnValue(new Promise(() => {}));
    await expect(renderDiagram('graph TD; TimeoutA --> TimeoutB', { timeoutMs: 10 })).rejects.toThrow(/timed out/i);
  });

  it('cancels work when the README is replaced', async () => {
    engine.render.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const work = renderDiagram('graph TD; CancelA --> CancelB', { signal: controller.signal });
    controller.abort();
    await expect(work).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not cache diagram failures', async () => {
    engine.render.mockRejectedValueOnce(new Error('Syntax error'));
    await expect(renderDiagram('invalid-source')).rejects.toThrow('Syntax error');
    engine.render.mockResolvedValueOnce({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Recovered</text></svg>' });
    await expect(renderDiagram('invalid-source')).resolves.toContain('Recovered');
  });

  it('renders safe math and rejects invalid formulas for source fallback', async () => {
    expect(await renderMath('x^2', false)).toContain('class="katex"');
    await expect(renderMath('\\invalidCommand', false)).rejects.toThrow();
    const result = await renderMath('\\href{javascript:alert(1)}{click}', false);
    const host = document.createElement('div');
    host.innerHTML = result;
    expect(host.querySelector('[href]')).toBeNull();
  });
});
