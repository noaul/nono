import { readFile, rm, stat, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const artifacts = await mkdtemp(path.join(os.tmpdir(), 'nono-extension-package-'));
const archive = path.join(artifacts, `nono-quick-bookmark-chrome-v${manifest.version}.zip`);
const unpacked = path.join(artifacts, `nono-quick-bookmark-chrome-v${manifest.version}`);
afterAll(() => rm(artifacts, { recursive: true, force: true }));

describe('extension release package', () => {
  it('builds the requested 0.4.3 release instead of republishing the retired 0.4.2 package', () => {
    expect(packageJson.version).toBe('0.4.3');
    expect(manifest.version).toBe('0.4.3');
  });

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
    expect(styles).toMatch(/:focus-visible\s*\{[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
    expect(styles).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ui-accent-ring\)/s);
    expect(styles).not.toMatch(/outline:\s*(none|0)\b/);
    expect(styles).toContain('--control-h: 32px');
  });

  it('follows the shared NoNo UI contract instead of a bespoke glass palette', async () => {
    const [html, styles] = await Promise.all([
      readFile(path.join(root, 'popup', 'popup.html'), 'utf8'),
      readFile(path.join(root, 'popup', 'popup.css'), 'utf8'),
    ]);

    // Contract accent in light mode and the OS-driven dark values (docs/design/ui-contract.md).
    expect(styles).toContain('--ui-accent: #0d9488');
    expect(styles).toContain('--ui-accent-ink: #ffffff');
    expect(styles).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{[^@]*--ui-accent: #2dd4bf[^@]*--ui-accent-ink: #042f2e/s);
    expect(styles).not.toContain('#167d86');
    expect(styles).not.toMatch(/backdrop-filter|gradient\(/);
    expect(styles).not.toMatch(/font-weight:\s*(8|9)\d\d/);

    // Legibility floor: nothing below 11px.
    const sizes = [...styles.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);

    // Colours come from the custom properties declared in the two :root blocks, nowhere else.
    const rules = styles.slice(styles.indexOf('* {'));
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);

    // Icon buttons use inline lucide-style SVGs and keep their accessible names.
    expect(html).not.toMatch(/&#9881;|&#215;|&#8635;|[⚙×↻]/);
    for (const id of ['settingsButton', 'closeSettings', 'refreshFolders']) {
      const button = html.match(new RegExp(`<button id="${id}"[^>]*>([\\s\\S]*?)</button>`));
      expect(button, id).not.toBeNull();
      expect(button[0], id).toMatch(/aria-label="[^"]+"/);
      expect(button[1], id).toMatch(/<svg class="icon" viewBox="0 0 24 24"[^>]*stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"/);
    }
  });

  it('saves connection drafts before requesting optional host permission', async () => {
    const popup = await readFile(path.join(root, 'popup', 'popup.js'), 'utf8');

    expect(popup).toContain("serverUrlInput.addEventListener('input'");
    expect(popup).toContain("tokenInput.addEventListener('input'");
    expect(popup.indexOf('await saveDraftFromInputs()')).toBeLessThan(popup.indexOf('await requestServerPermission(candidate.serverUrl)'));
    expect(popup).toContain("let activeServerUrl = ''");
    expect(popup).not.toContain('config = { ...config, ...draft }');
  });

  it('keeps bookmark capture compact', async () => {
    const [html, popup, styles] = await Promise.all([
      readFile(path.join(root, 'popup', 'popup.html'), 'utf8'),
      readFile(path.join(root, 'popup', 'popup.js'), 'utf8'),
      readFile(path.join(root, 'popup', 'popup.css'), 'utf8'),
    ]);

    expect(html).not.toContain('data-i18n="saveTo"');
    expect(html).toContain('id="bookmarkPanel" class="mode-panel"');
    expect(popup).not.toContain("t('pickThenSave')");
    expect(popup).not.toContain("pagePreview.classList.toggle('hidden', clipping)");
    expect(styles).toContain('.mode-panel');
    expect(styles).toContain('min-height: var(--control-h)');
  });

  it('keeps the popup inside one solid viewport without an inner scrollbar', async () => {
    const styles = await readFile(path.join(root, 'popup', 'popup.css'), 'utf8');

    // The popup is the whole browser window, so the shell is square and opaque: a rounded body
    // would show the window's own background in its corners, most visibly in dark mode.
    expect(styles).not.toMatch(/(html|body)\s*\{[^}]*border-radius/s);
    expect(styles).toMatch(/body\s*\{[^}]*background:\s*var\(--ui-canvas\)/s);
    expect(styles).toMatch(/body\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.popup\s*\{[^}]*max-height:\s*600px/s);
    expect(styles).toMatch(/\.popup\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).not.toMatch(/\.popup\s*\{[^}]*overflow-y:\s*auto/s);
  });

  it('builds a Chrome Web Store ZIP archive', async () => {
    const result = spawnSync(process.execPath, ['scripts/package.mjs', '--output-dir', artifacts], { cwd: root, encoding: 'utf8' });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const content = await readFile(archive);
    expect(content.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(content.length).toBeGreaterThan(10_000);
    expect(JSON.parse(await readFile(path.join(unpacked, 'manifest.json'), 'utf8')).version).toBe(manifest.version);
  });

  it('produces the same archive bytes on repeated builds', async () => {
    const first = spawnSync(process.execPath, ['scripts/package.mjs', '--output-dir', artifacts], { cwd: root, encoding: 'utf8' });
    expect(first.status, first.stderr || first.stdout).toBe(0);
    const firstContent = await readFile(archive);

    const second = spawnSync(process.execPath, ['scripts/package.mjs', '--output-dir', artifacts], { cwd: root, encoding: 'utf8' });
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

  it('keeps the injected bookmark extractor lightweight', async () => {
    const content = await readFile(path.join(dist, 'content.js'), 'utf8');

    expect(content).not.toContain('contentMarkdown');
    expect(content.length).toBeLessThan(100_000);
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
