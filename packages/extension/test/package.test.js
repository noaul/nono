import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const archive = path.join(root, 'artifacts', `nono-quick-bookmark-chrome-v${manifest.version}.zip`);
const unpacked = path.join(root, 'artifacts', `nono-quick-bookmark-chrome-v${manifest.version}`);

describe('extension release package', () => {
  it('keeps background context menus in sync with the saved locale', async () => {
    const background = await readFile(path.join(root, 'background.js'), 'utf8');

    expect(background).toContain('LOCALE_STORAGE_KEY');
    expect(background).toContain('localeFromUiLanguage');
    expect(background).toContain('chrome.storage.local.get');
    expect(background).toContain('chrome.storage.onChanged.addListener');
    expect(background).toContain('createContextMenus()');
  });

  it('keeps package and manifest versions aligned', () => {
    expect(manifest.version).toBe(packageJson.version);
  });

  it('limits page access to an active user action and requests only the configured server origin', () => {
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(expect.arrayContaining([
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ]));
  });

  it('exposes project and version information in the popup and manifest', async () => {
    const popup = await readFile(path.join(root, 'popup', 'popup.html'), 'utf8');

    expect(manifest.homepage_url).toBe('https://github.com/noaul/nono');
    expect(popup).toContain('https://github.com/noaul/nono');
    expect(popup).toContain('id="versionLabel"');
    expect(popup).toContain('id="duplicateAction"');
  });

  it('keeps popup controls keyboard and touch friendly', async () => {
    const styles = await readFile(path.join(root, 'popup', 'popup.css'), 'utf8');

    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('touch-action: manipulation');
    expect(styles).toContain('button:disabled');
    expect(styles).toContain('width: 340px');
    expect(styles).toContain('backdrop-filter: blur(24px) saturate(135%)');
    expect(styles).toContain('@media (prefers-reduced-transparency: reduce)');
  });

  it('saves connection drafts before requesting optional host permission', async () => {
    const popup = await readFile(path.join(root, 'popup', 'popup.js'), 'utf8');

    expect(popup).toContain("serverUrlInput.addEventListener('input'");
    expect(popup).toContain("tokenInput.addEventListener('input'");
    expect(popup.indexOf('await saveDraftFromInputs()')).toBeLessThan(popup.indexOf('await requestServerPermission(candidate.serverUrl)'));
    expect(popup).toContain("let activeServerUrl = ''");
    expect(popup).not.toContain('config = { ...config, ...draft }');
  });

  it('keeps bookmark and clip modes compact and structurally aligned', async () => {
    const [html, popup, styles] = await Promise.all([
      readFile(path.join(root, 'popup', 'popup.html'), 'utf8'),
      readFile(path.join(root, 'popup', 'popup.js'), 'utf8'),
      readFile(path.join(root, 'popup', 'popup.css'), 'utf8'),
    ]);

    expect(html).not.toContain('data-i18n="saveTo"');
    expect(html).toContain('id="clipPreviewMeta"');
    expect(html).toContain('id="clipSummaryInput" maxlength="2000" rows="2"');
    expect(html).toContain('id="bookmarkPanel" class="mode-panel"');
    expect(html).toContain('id="clipPanel" class="clip-panel mode-panel hidden"');
    expect(popup).not.toContain("t('pickThenSave')");
    expect(popup).not.toContain("pagePreview.classList.toggle('hidden', clipping)");
    expect(styles).toContain('.mode-panel');
    expect(styles).toContain('min-height: 26px');
  });

  it('keeps the popup inside one rounded frosted viewport without an inner scrollbar', async () => {
    const styles = await readFile(path.join(root, 'popup', 'popup.css'), 'utf8');

    expect(styles).toMatch(/html\s*\{[^}]*border-radius:\s*18px/s);
    expect(styles).toMatch(/body\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,/s);
    expect(styles).toMatch(/body\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.popup\s*\{[^}]*max-height:\s*600px/s);
    expect(styles).toMatch(/\.popup\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).not.toMatch(/\.popup\s*\{[^}]*overflow-y:\s*auto/s);
  });

  it('builds a Chrome Web Store ZIP archive', async () => {
    await rm(path.join(root, 'artifacts'), { recursive: true, force: true });
    const result = spawnSync(process.execPath, ['scripts/package.mjs'], { cwd: root, encoding: 'utf8' });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const content = await readFile(archive);
    expect(content.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(content.length).toBeGreaterThan(10_000);
    expect(JSON.parse(await readFile(path.join(unpacked, 'manifest.json'), 'utf8')).version).toBe(manifest.version);
  });

  it('produces the same archive bytes on repeated builds', async () => {
    const first = spawnSync(process.execPath, ['scripts/package.mjs'], { cwd: root, encoding: 'utf8' });
    expect(first.status, first.stderr || first.stdout).toBe(0);
    const firstContent = await readFile(archive);

    const second = spawnSync(process.execPath, ['scripts/package.mjs'], { cwd: root, encoding: 'utf8' });
    expect(second.status, second.stderr || second.stdout).toBe(0);
    expect(await readFile(archive)).toEqual(firstContent);
  });
});

describe('extension bundle formats', () => {
  const dist = path.join(root, 'dist');

  beforeAll(() => {
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  // Chrome cannot inject an ES module as a content script. If the bundle keeps module syntax the
  // script fails silently in the page, which is exactly the sort of break a unit test never sees.
  it('emits the injected content script as a self-contained IIFE', async () => {
    const content = await readFile(path.join(dist, 'content.js'), 'utf8');

    expect(content).not.toMatch(/^\s*import\s/m);
    expect(content).not.toMatch(/^\s*export\s/m);
    expect(content).not.toMatch(/\bfrom\s+['"]defuddle/);
  });

  it('bundles the article extractor into the content script', async () => {
    const content = await readFile(path.join(dist, 'content.js'), 'utf8');

    // defuddle/full is the only entry point that can produce Markdown; the core bundle cannot.
    expect(content).toContain('contentMarkdown');
    expect(content.length).toBeGreaterThan(100_000);
  });

  it('leaves no unresolved imports in the module bundles', async () => {
    for (const relative of ['background.js', 'popup/popup.js']) {
      const bundle = await readFile(path.join(dist, relative), 'utf8');

      expect(bundle, relative).not.toMatch(/\bfrom\s+['"]defuddle/);
      expect(bundle, relative).not.toMatch(/\bfrom\s+['"]\.\.?\/shared\//);
    }
  });

  it('does not ship source modules alongside the bundles', async () => {
    await expect(stat(path.join(dist, 'shared'))).rejects.toThrow();
  });
});
