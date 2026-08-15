import { describe, expect, it } from 'vitest';
import {
  extractArticle,
  extractCanonicalUrl,
  extractPageMetadata,
  extractSelection,
} from '../shared/extract.js';

const ARTICLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Nono Refactor</title>
    <meta name="description" content="Modern bookmark manager" />
    <meta property="og:title" content="OG Nono" />
    <meta property="og:site_name" content="Example Site" />
    <link rel="canonical" href="https://example.com/article" />
  </head>
  <body>
    <nav><a href="/elsewhere">Site navigation that is not the article</a></nav>
    <article>
      <h1>Nono Refactor</h1>
      <p>Article body paragraph one, long enough to survive content scoring and be treated as the main content of this page.</p>
      <p>Article body paragraph two, also long enough that the extractor keeps it rather than discarding it as boilerplate.</p>
    </article>
    <footer>Footer boilerplate that should be dropped.</footer>
  </body>
</html>`;

function loadDocument(html = ARTICLE_HTML, url = 'https://example.com/article?utm_source=news#section') {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  Object.defineProperty(parsed, 'URL', { value: url, configurable: true });
  return parsed;
}

describe('page metadata extraction', () => {
  it('extracts title, description, og tags and a compact body summary', () => {
    const documentLike = {
      title: 'Nono Refactor',
      querySelector(selector) {
        const values = {
          'meta[name="description"]': { content: 'Modern bookmark manager' },
          'meta[property="og:title"]': { content: 'OG Nono' },
        };
        return values[selector] || null;
      },
      body: {
        innerText: 'A '.repeat(400),
      },
    };

    const meta = extractPageMetadata(documentLike);

    expect(meta.title).toBe('Nono Refactor');
    expect(meta.description).toBe('Modern bookmark manager');
    expect(meta.ogTitle).toBe('OG Nono');
    expect(meta.content.length).toBeLessThanOrEqual(500);
  });
});

describe('article extraction', () => {
  it('returns both sanitizable HTML and Markdown for the main content', () => {
    const result = extractArticle(loadDocument());

    expect(result.contentHtml).toContain('<p>');
    expect(result.contentMd).toContain('Article body');
    expect(result.siteName).toBe('Example Site');
    expect(result.canonicalUrl).toBe('https://example.com/article');
  });

  it('reports the extractor and drops page furniture', () => {
    const result = extractArticle(loadDocument());

    expect(result.extractor).toBe('defuddle');
    expect(result.contentHtml).not.toContain('Site navigation that is not the article');
    expect(result.contentHtml).not.toContain('Footer boilerplate');
  });

  // Multi-byte characters on purpose: a byte-budget truncation that ignores encoding splits these
  // in half. Few, large paragraphs keep the node count (and the runtime) down.
  it('marks oversized content as truncated on a UTF-8 boundary', { timeout: 20_000 }, () => {
    const huge = `<!doctype html><html><head><title>Big</title></head><body><article>${
      `<p>${'蒙'.repeat(30_000)}</p>`.repeat(30)
    }</article></body></html>`;

    const result = extractArticle(loadDocument(huge, 'https://example.com/big'));

    expect(result.contentTruncated).toBe(true);
    expect(Buffer.byteLength(result.contentHtml, 'utf8')).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(Buffer.byteLength(result.contentMd, 'utf8')).toBeLessThanOrEqual(2 * 1024 * 1024);
    // A boundary-safe truncation never leaves a replacement character behind.
    expect(result.contentHtml).not.toContain('�');
  });
});

describe('selection extraction', () => {
  it('returns only the selected range', () => {
    const doc = loadDocument();
    const paragraphs = doc.querySelectorAll('article p');
    const range = doc.createRange();
    range.selectNodeContents(paragraphs[0]);
    const selection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => paragraphs[0].textContent,
    };

    const result = extractSelection(selection, doc);

    expect(result.extractor).toBe('selection');
    expect(result.contentMd).toContain('Article body paragraph one');
    expect(result.contentHtml).not.toContain('Article body paragraph two');
    expect(result.contentHtml).not.toContain('Site navigation that is not the article');
    expect(result.contentHtml).not.toContain('Footer boilerplate');
  });

  it('rewrites relative URLs to absolute ones', () => {
    const doc = loadDocument(
      '<!doctype html><html><head><title>Rel</title></head><body><article><p id="p">'
      + '<a href="/deep/link">anchor</a><img src="../img/photo.png" alt="photo" />'
      + '</p></article></body></html>',
      'https://example.com/section/article',
    );
    const target = doc.querySelector('#p');
    const range = doc.createRange();
    range.selectNodeContents(target);
    const selection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => target.textContent,
    };

    const result = extractSelection(selection, doc);

    expect(result.contentHtml).toContain('https://example.com/deep/link');
    expect(result.contentHtml).toContain('https://example.com/img/photo.png');
  });

  it('returns null when nothing is selected', () => {
    const doc = loadDocument();
    expect(extractSelection({ isCollapsed: true, rangeCount: 0 }, doc)).toBeNull();
  });
});

describe('canonical URL extraction', () => {
  it('prefers the declared canonical link', () => {
    expect(extractCanonicalUrl(loadDocument(), 'https://example.com/article?utm_source=news'))
      .toBe('https://example.com/article');
  });

  it('lowercases the host, drops default ports and fragments, and sorts query parameters', () => {
    const doc = loadDocument('<!doctype html><html><head><title>No canonical</title></head><body></body></html>');

    expect(extractCanonicalUrl(doc, 'https://EXAMPLE.com:443/path?b=2&a=1#frag'))
      .toBe('https://example.com/path?a=1&b=2');
  });

  it('removes only the known tracking parameters', () => {
    const doc = loadDocument('<!doctype html><html><head><title>No canonical</title></head><body></body></html>');

    expect(extractCanonicalUrl(
      doc,
      'https://example.com/p?utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e'
      + '&gclid=f&fbclid=g&mc_cid=h&mc_eid=i&id=42&ref=keepme',
    )).toBe('https://example.com/p?id=42&ref=keepme');
  });
});
