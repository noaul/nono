import { describe, expect, it } from 'vitest';
import { scanDomForTranslation, wrapTextNodesWithAttr } from './domTextScanner';

describe('README visual content during bilingual translation', () => {
  it('keeps an equation in its original paragraph while translating the prose', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Equation <span data-translate="false"><span class="katex">x squared</span></span> explains growth.</p>';
    const [segment] = scanDomForTranslation(root);
    expect(segment.text).toBe('Equation  explains growth.');
    expect(segment.hasVisualContent).toBe(true);
    wrapTextNodesWithAttr(segment.element, 'data-bi-original', 'true');
    expect(root.querySelector('.katex [data-bi-original]')).toBeNull();
  });

  it('does not translate diagram source summaries or error messages', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-translate="false"><p>Diagram unavailable</p><details><summary>Mermaid source</summary><pre><code>graph TD; A--&gt;B</code></pre></details></div><p>Explain the diagram.</p>';
    expect(scanDomForTranslation(root).map(segment => segment.text)).toEqual(['Explain the diagram.']);
  });
});
