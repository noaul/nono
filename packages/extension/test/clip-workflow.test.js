import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildClipPayload,
  clipErrorMessage,
  CLIP_MODES,
  isClipMode,
} from '../shared/popup-workflow.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const article = {
  url: 'https://example.com/article?utm_source=news',
  canonicalUrl: 'https://example.com/article',
  title: 'Article',
  author: 'Writer',
  siteName: 'Example Site',
  description: 'A description',
  domain: 'example.com',
  favicon: 'https://example.com/favicon.ico',
  image: 'https://example.com/cover.png',
  lang: 'en',
  publishedAt: '2026-08-01',
  wordCount: 400,
  contentHtml: '<p>body</p>',
  contentMd: 'body',
  contentTruncated: false,
  extractor: 'defuddle',
  sourceMeta: { metaTags: [], schemaOrgData: null },
};

describe('clip mode', () => {
  it('offers exactly bookmark and clip', () => {
    expect(CLIP_MODES).toEqual(['bookmark', 'clip']);
  });

  it('recognizes only known modes', () => {
    expect(isClipMode('clip')).toBe(true);
    expect(isClipMode('bookmark')).toBe(true);
    expect(isClipMode('anything-else')).toBe(false);
    expect(isClipMode(undefined)).toBe(false);
  });
});

describe('clip payload', () => {
  it('maps the extraction onto the ingest contract', () => {
    const payload = buildClipPayload(article);

    expect(payload).toMatchObject({
      url: 'https://example.com/article?utm_source=news',
      canonicalUrl: 'https://example.com/article',
      title: 'Article',
      author: 'Writer',
      siteName: 'Example Site',
      contentHtml: '<p>body</p>',
      contentMd: 'body',
      extractor: 'defuddle',
      wordCount: 400,
    });
  });

  it('carries the truncation flag so the server can record it', () => {
    expect(buildClipPayload({ ...article, contentTruncated: true }).contentTruncated).toBe(true);
  });

  it('does not invent a title', () => {
    const payload = buildClipPayload({ ...article, title: '' });
    expect(payload.title).toBe('https://example.com/article');
  });

  it('omits an empty canonical URL rather than sending an invalid one', () => {
    const payload = buildClipPayload({ ...article, canonicalUrl: '' });
    expect(payload.canonicalUrl).toBeUndefined();
  });

  it('passes selection extractions through unchanged', () => {
    const payload = buildClipPayload({ ...article, extractor: 'selection' });
    expect(payload.extractor).toBe('selection');
  });
});

describe('clip error messages', () => {
  it('explains a missing clip scope rather than showing a bare 403', () => {
    const message = clipErrorMessage({ status: 403, message: 'API token scope is insufficient' });

    expect(message).toMatch(/scope|权限/i);
    // The fix is a token change, so the message has to point there.
    expect(message.toLowerCase()).toContain('token');
  });

  it('passes other failures through', () => {
    expect(clipErrorMessage({ status: 500, message: 'Server exploded' })).toContain('Server exploded');
  });
});

describe('background clip entry points', () => {
  it('registers page and selection context menus', async () => {
    const background = await readFile(path.join(root, 'background.js'), 'utf8');

    expect(background).toContain('nono-clip-page');
    expect(background).toContain('nono-clip-selection');
    // The selection entry only makes sense when there is a selection.
    expect(background).toMatch(/contexts:\s*\['selection'\]/);
  });

  it('binds the clip shortcut', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

    expect(manifest.commands['clip-current-page']).toBeDefined();
    expect(manifest.commands['clip-current-page'].suggested_key.default).toBe('Alt+Shift+C');
    expect(background(manifest)).toBe(true);
  });

  it('keeps permissions unchanged', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

    // Clipping must not widen what the extension can reach.
    expect(manifest.permissions).toEqual(['activeTab', 'storage', 'scripting', 'contextMenus']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('ships version 0.4.0 in both manifest and package', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

    expect(manifest.version).toBe('0.4.0');
    expect(packageJson.version).toBe('0.4.0');
  });
});

describe('popup clip surface', () => {
  it('offers a bookmark/clip segmented control and a clip preview', async () => {
    const html = await readFile(path.join(root, 'popup', 'popup.html'), 'utf8');

    expect(html).toContain('id="modeBookmark"');
    expect(html).toContain('id="modeClip"');
    expect(html).toContain('id="clipPreview"');
    expect(html).toContain('id="saveClip"');
  });

  it('extracts the article only after the user asks for a clip', async () => {
    const popup = await readFile(path.join(root, 'popup', 'popup.js'), 'utf8');

    // The cheap metadata read still happens on open; the full parse must not.
    expect(popup).toContain('NONO_EXTRACT_ARTICLE');
    expect(popup).not.toMatch(/init\(\)[\s\S]{0,400}NONO_EXTRACT_ARTICLE/);
  });

  it('posts clips to the clipper ingest route', async () => {
    const popup = await readFile(path.join(root, 'popup', 'popup.js'), 'utf8');

    expect(popup).toContain('/api/clipper/clips');
  });
});

function background(manifest) {
  return Object.keys(manifest.commands).includes('clip-current-page');
}
