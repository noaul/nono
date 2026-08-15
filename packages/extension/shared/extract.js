import Defuddle, { createMarkdownContent } from 'defuddle/full';

/**
 * Only `defuddle/full` can produce Markdown. The core `defuddle` bundle ships without Turndown, so
 * `contentMarkdown` is permanently undefined there — the failure is silent, which is why the import
 * path matters more than it looks.
 */

// Mirrors MAX_CLIP_CONTENT_BYTES on the server. Truncating here keeps the request under the ingest
// body limit; the server still rejects anything that arrives over the limit.
export const MAX_CLIP_CONTENT_BYTES = 2 * 1024 * 1024;

// Deliberately closed. Stripping unknown query parameters would break URLs that need them to
// resolve to the right document.
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
]);

export function extractPageMetadata(doc = document) {
  const read = (selector) => doc.querySelector(selector)?.content || '';
  const text = String(doc.body?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    title: doc.title || read('meta[property="og:title"]'),
    description: read('meta[name="description"]') || read('meta[property="og:description"]'),
    ogTitle: read('meta[property="og:title"]'),
    ogImage: read('meta[property="og:image"]'),
    content: text.slice(0, 500),
  };
}

export function extractArticle(doc = document, { pageUrl } = {}) {
  const url = pageUrl || documentUrl(doc);

  // useAsync defaults to true, which lets Defuddle call third-party APIs when local extraction
  // comes up empty. Clipping must not make requests the user did not ask for.
  const result = new Defuddle(doc, {
    separateMarkdown: true,
    useAsync: false,
    url,
  }).parse();

  const html = truncateUtf8(result.content || '', MAX_CLIP_CONTENT_BYTES);
  const markdown = truncateUtf8(result.contentMarkdown || '', MAX_CLIP_CONTENT_BYTES);

  return {
    url,
    canonicalUrl: extractCanonicalUrl(doc, url),
    title: result.title || doc.title || '',
    author: result.author || '',
    siteName: result.site || '',
    description: result.description || '',
    domain: result.domain || hostOf(url),
    favicon: result.favicon || '',
    image: result.image || '',
    lang: result.language || '',
    publishedAt: result.published || '',
    wordCount: result.wordCount || 0,
    contentHtml: html.value,
    contentMd: markdown.value,
    contentTruncated: html.truncated || markdown.truncated,
    extractor: 'defuddle',
    sourceMeta: {
      metaTags: result.metaTags || [],
      schemaOrgData: result.schemaOrgData ?? null,
    },
  };
}

export function extractSelection(selection = window.getSelection(), doc = document, { pageUrl } = {}) {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

  const url = pageUrl || documentUrl(doc);
  const holder = doc.createElement('div');
  holder.appendChild(selection.getRangeAt(0).cloneContents());

  // The clipped fragment leaves its document behind, so relative URLs have to be resolved now or
  // they resolve against the Clipper origin later.
  absolutizeUrls(holder, url);

  const html = truncateUtf8(holder.innerHTML, MAX_CLIP_CONTENT_BYTES);
  const markdown = truncateUtf8(createMarkdownContent(holder.innerHTML, url), MAX_CLIP_CONTENT_BYTES);
  const text = String(selection.toString() || holder.textContent || '').replace(/\s+/g, ' ').trim();

  return {
    url,
    canonicalUrl: extractCanonicalUrl(doc, url),
    title: doc.title || '',
    author: '',
    siteName: doc.querySelector('meta[property="og:site_name"]')?.content || '',
    description: text.slice(0, 500),
    domain: hostOf(url),
    favicon: '',
    image: '',
    lang: doc.documentElement?.lang || '',
    publishedAt: '',
    wordCount: text ? text.split(/\s+/).length : 0,
    contentHtml: html.value,
    contentMd: markdown.value,
    contentTruncated: html.truncated || markdown.truncated,
    extractor: 'selection',
    sourceMeta: null,
  };
}

export function extractCanonicalUrl(doc = document, pageUrl = location.href) {
  const declared = doc.querySelector?.('link[rel="canonical"]')?.getAttribute?.('href') || '';
  let candidate = pageUrl;
  if (declared) {
    try {
      candidate = new URL(declared, pageUrl).toString();
    } catch {
      candidate = pageUrl;
    }
  }
  return normalizeUrl(candidate);
}

function normalizeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return String(value || '');
  }

  // The URL parser already lowercases the host and drops the default port for the scheme.
  url.hash = '';

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  const query = new URLSearchParams(kept).toString();
  url.search = query ? `?${query}` : '';
  return url.toString();
}

function absolutizeUrls(root, baseUrl) {
  for (const attribute of ['href', 'src']) {
    for (const node of root.querySelectorAll(`[${attribute}]`)) {
      const absolute = toAbsolute(node.getAttribute(attribute), baseUrl);
      if (absolute) node.setAttribute(attribute, absolute);
    }
  }
}

function toAbsolute(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return '';
  }
}

function documentUrl(doc) {
  return doc?.URL || doc?.location?.href || (typeof location === 'undefined' ? '' : location.href);
}

function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

/**
 * Truncates to a UTF-8 byte budget without splitting a character. Decoding with `stream: true`
 * holds back an incomplete trailing sequence instead of emitting U+FFFD for it.
 */
function truncateUtf8(value, maxBytes) {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) return { value, truncated: false };

  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, maxBytes), { stream: true });
  return { value: head, truncated: true };
}
