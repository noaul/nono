import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SandboxedArticle } from './SandboxedArticle';
import { buildAnchor, isStale, resolveHighlight } from './highlightAnchor';
import type { ClipHighlight } from '../services/api';

describe('sandboxed article', () => {
  it('never grants the article permission to run scripts', () => {
    const { container } = render(<SandboxedArticle html="<p>body</p>" />);
    const frame = container.querySelector('iframe')!;

    const sandbox = frame.getAttribute('sandbox') || '';
    // The single most important attribute in this app: clipped HTML is untrusted, and this is the
    // last line of defence behind server-side sanitization.
    expect(sandbox).not.toContain('allow-scripts');
    expect(sandbox).toContain('allow-same-origin');
  });

  it('renders the article through srcdoc rather than a live document URL', () => {
    const { container } = render(<SandboxedArticle html="<p>hello body</p>" />);
    const frame = container.querySelector('iframe')!;

    expect(frame.getAttribute('srcdoc')).toContain('hello body');
    expect(frame.getAttribute('src')).toBeNull();
  });

  it('carries reader preferences without touching the stored article', () => {
    const html = '<p>body</p>';
    const { container, rerender } = render(<SandboxedArticle html={html} fontScale={1} />);
    const before = container.querySelector('iframe')!.getAttribute('srcdoc')!;

    rerender(<SandboxedArticle html={html} fontScale={1.5} measure="wide" />);
    const after = container.querySelector('iframe')!.getAttribute('srcdoc')!;

    expect(before).not.toEqual(after);
    expect(after).toContain('data-measure="wide"');
    // The article markup itself is unchanged; only the wrapper differs.
    expect(after).toContain(html);
  });
});

function highlight(overrides: Partial<ClipHighlight> = {}): ClipHighlight {
  return {
    id: 1,
    clipId: 1,
    text: 'the important part',
    note: null,
    color: 'yellow',
    contentVersion: 1,
    anchor: { quote: 'the important part' },
    createdAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  } as ClipHighlight;
}

describe('highlight anchoring', () => {
  const text = 'Before text. the important part. After text.';

  it('resolves a unique quote', () => {
    const resolved = resolveHighlight(text, highlight(), 1);

    expect(isStale(resolved)).toBe(false);
    if (!isStale(resolved)) {
      expect(text.slice(resolved.start, resolved.end)).toBe('the important part');
    }
  });

  it('uses surrounding context to pick between duplicate quotes', () => {
    const doubled = 'A. repeat me. B. repeat me. C.';
    const resolved = resolveHighlight(
      doubled,
      highlight({ text: 'repeat me', anchor: { quote: 'repeat me', prefix: 'B. ', suffix: '. C.' } }),
      1,
    );

    expect(isStale(resolved)).toBe(false);
    if (!isStale(resolved)) expect(resolved.start).toBe(doubled.indexOf('repeat me', 10));
  });

  it('reports a highlight as stale rather than guessing when the quote is gone', () => {
    const resolved = resolveHighlight('Completely different body.', highlight(), 2);

    expect(isStale(resolved)).toBe(true);
    if (isStale(resolved)) expect(resolved.reason).toBe('version');
  });

  it('does not fall back to a stored offset after the body changed', () => {
    const doubled = 'x. same. y. same. z.';
    const resolved = resolveHighlight(
      doubled,
      // Captured against version 1; the article is now on version 2, so the offset is untrustworthy.
      highlight({ text: 'same', anchor: { quote: 'same', startOffset: 3 }, contentVersion: 1 }),
      2,
    );

    expect(isStale(resolved)).toBe(true);
    if (isStale(resolved)) expect(resolved.reason).toBe('ambiguous');
  });

  it('builds an anchor carrying quote, context and offsets', () => {
    const anchor = buildAnchor(text, 'the important part', text.indexOf('the important part'));

    expect(anchor.quote).toBe('the important part');
    expect(anchor.prefix).toContain('Before text.');
    expect(anchor.suffix).toContain('After text.');
    expect(anchor.startOffset).toBe(text.indexOf('the important part'));
  });
});
