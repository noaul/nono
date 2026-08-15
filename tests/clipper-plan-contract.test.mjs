import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/**
 * The Clipper design document is the contract the implementation is written against, so the
 * decisions that are easy to get subtly wrong are pinned here rather than left to review.
 *
 * Three of these are corrections of earlier drafts that were actually wrong against the shipped
 * Defuddle 0.19.x API and against the Chrome extension execution model:
 *
 *   - `result.markdown` does not exist. Markdown is returned as `contentMarkdown`, and only when
 *     `separateMarkdown: true` is passed.
 *   - `useAsync` defaults to true, which lets extraction reach third-party APIs. Clipping must not
 *     make network calls the user did not ask for, so the document must pin it to false.
 *   - An injected content script cannot be an ES module. Only the background worker and the popup
 *     may be built as ESM.
 */

const root = process.cwd();
const DOC = 'docs/design/clipper-module-plan.md';

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');

test('the document pins the correct Defuddle extraction contract', () => {
  const doc = read(DOC);

  assert.match(doc, /separateMarkdown:\s*true/, 'must pass separateMarkdown: true to get Markdown back');
  assert.match(doc, /result\.contentMarkdown/, 'must read Markdown from result.contentMarkdown');
  assert.match(doc, /useAsync:\s*false/, 'must disable third-party async extractors');

  assert.doesNotMatch(
    doc,
    /result\.markdown\b/,
    'result.markdown is not a real Defuddle field and must not appear',
  );
});

test('the document builds the content script as IIFE, not ESM', () => {
  const doc = read(DOC);

  assert.match(doc, /format:\s*'iife'/, 'the injected content script must be built as IIFE');

  const esmContentScript = doc
    .split('\n')
    .filter((line) => line.includes('content.js') && /\besm\b/i.test(line));

  assert.deepEqual(
    esmContentScript,
    [],
    'no instruction may build content.js as ESM; Chrome cannot inject an ES module as a content script',
  );
});

test('the document pins the trigram search implementation', () => {
  const doc = read(DOC);

  assert.match(doc, /pg_trgm/, 'first search implementation is pg_trgm');
  assert.match(doc, /gin_trgm_ops/, 'the GIN index must name the trigram operator class');
  assert.match(doc, /searchText/, 'search reads a generated searchText column');
});

test('the document pins the ingest size limits', () => {
  const doc = read(DOC);

  assert.match(doc, /6\s*MiB/, 'the ingest body limit is 6 MiB');
  assert.match(doc, /2\s*MiB/, 'each content field is capped at 2 MiB');
  assert.match(doc, /256\s*KiB/, 'sourceMeta is capped at 256 KiB');
  assert.match(doc, /contentTruncated/, 'client-side truncation must be reported to the server');
});

test('the document keeps stored token scopes editable rather than silently widened', () => {
  const doc = read(DOC);

  assert.match(
    doc,
    /PATCH\s+\/api\/admin\/tokens/,
    'existing tokens gain clip scopes through an explicit browser-session endpoint',
  );
  assert.match(
    doc,
    /token material/,
    'the document must state that amending scopes does not change token material',
  );
});

test('the document pins resilient highlight anchors', () => {
  const doc = read(DOC);

  for (const field of ['prefix', 'suffix', 'contentVersion']) {
    assert.match(doc, new RegExp(field), `highlight anchors must record ${field}`);
  }
  assert.match(doc, /stale/i, 'unresolved highlights are presented as stale, never mis-attached');
});

test('the document pins stable bookmark references in backups', () => {
  const doc = read(DOC);

  assert.match(doc, /normalizedUrl/, 'backup bookmark references resolve by normalized URL');
  assert.match(doc, /folderPath/, 'backup bookmark references resolve by folder ancestry');
  assert.match(
    doc,
    /ClipBookmarkRef/,
    'the document must name the bookmark reference type used in backup artifacts',
  );
  assert.match(
    doc,
    /linkId/,
    'the document must state why a raw linkId is unsuitable as a restore reference',
  );
  assert.match(
    doc,
    /detached|游离/,
    'an ambiguous or missing bookmark reference must leave the clip detached, never mis-attached',
  );
});
