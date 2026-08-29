import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/**
 * The shared UI contract is duplicated into every operator-facing app because each of those apps is
 * an independent project: apps/nostar, apps/nomoney and apps/clipper sit outside the root npm
 * workspaces and carry their own lockfiles, so none of them can reference a shared workspace
 * package, and each dev server resolves only from its own root.
 *
 * The Docker build is not the reason. The build context is the repository root and the Dockerfile
 * already copies across directories, so a shared file would be reachable at build time. Sharing it
 * for real means adding a sync step and touching all four toolchains.
 *
 * These tests are what make the duplication safe in the meantime: the copies must stay
 * byte-identical, and the values must match what docs/design/ui-contract.md documents.
 */

const root = process.cwd();
const CANONICAL = 'packages/web/src/styles/design-tokens.css';
const COPIES = [
  'apps/nostar/src/design-tokens.css',
  'apps/nomoney/frontend/src/design-tokens.css',
  'apps/clipper/src/design-tokens.css',
];

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');

test('every app ships a byte-identical copy of the design tokens', () => {
  const canonical = read(CANONICAL);
  assert.ok(canonical.includes('SHARED-UI-CONTRACT v1'), 'canonical token file must carry the contract marker');

  for (const copy of COPIES) {
    assert.equal(read(copy), canonical, `${copy} has drifted from ${CANONICAL}`);
  }
});

test('the tokens match the documented contract', () => {
  const tokens = read(CANONICAL);
  const doc = read('docs/design/ui-contract.md');

  // Geometry the shell depends on. These are also asserted against the doc so the two cannot
  // disagree silently.
  const geometry = {
    '--ui-sidebar-w': '256px',
    '--ui-topbar-h': '64px',
    '--ui-content-max': '1280px',
    '--ui-control-h': '40px',
    '--ui-control-h-sm': '32px',
    '--ui-icon-btn': '36px',
    '--ui-radius-sm': '8px',
    '--ui-radius-md': '10px',
    '--ui-radius-lg': '12px',
  };
  for (const [name, value] of Object.entries(geometry)) {
    assert.ok(tokens.includes(`${name}: ${value};`), `${name} must be ${value}`);
    assert.ok(doc.includes(`\`${name}\``), `${name} must be documented`);
    assert.ok(doc.includes(`\`${value}\``), `${value} must appear in the contract doc`);
  }

  // Radii stay inside the agreed 8-12px band.
  for (const radius of ['--ui-radius-sm', '--ui-radius-md', '--ui-radius-lg']) {
    const match = new RegExp(`${radius}: (\\d+)px;`).exec(tokens);
    assert.ok(match, `${radius} must be declared in px`);
    const px = Number(match[1]);
    assert.ok(px >= 8 && px <= 12, `${radius} is ${px}px, outside the 8-12px band`);
  }
});

test('the accent is a single restrained teal, not blue or purple', () => {
  const tokens = read(CANONICAL);

  assert.ok(tokens.includes('--ui-accent: #0d9488;'), 'light accent must be teal-600');
  assert.ok(tokens.includes('--ui-accent: #2dd4bf;'), 'dark accent must be teal-400');

  // Palettes the apps used to carry, which must not come back through the shared contract.
  for (const banned of ['#5e6ad2', '#7170ff', '#2563eb', '#3b82f6', '#7c3aed', '#8b5cf6']) {
    assert.ok(!tokens.toLowerCase().includes(banned), `${banned} must not appear in the shared tokens`);
  }
});

test('both colour modes define the full token set', () => {
  const tokens = read(CANONICAL);
  const [, light = '', dark = ''] = tokens.split(/:root\[data-color-mode='dark'\],|^:root \{/m);

  const required = [
    '--ui-canvas', '--ui-surface', '--ui-surface-raised', '--ui-surface-sunken',
    '--ui-border', '--ui-border-strong',
    '--ui-text', '--ui-text-muted', '--ui-text-subtle',
    '--ui-accent', '--ui-accent-hover', '--ui-accent-ink', '--ui-accent-soft', '--ui-accent-ring',
    '--ui-success', '--ui-warning', '--ui-danger', '--ui-info',
  ];
  for (const token of required) {
    assert.ok(light.includes(`${token}:`), `${token} missing from the light block`);
    assert.ok(dark.includes(`${token}:`), `${token} missing from the dark block`);
  }
});

test('motion collapses under a reduced-motion preference', () => {
  const tokens = read(CANONICAL);
  assert.match(tokens, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(tokens, /--ui-dur-base: 0ms;/);
});

test('every app imports the contract where it boots', () => {
  const entries = {
    'packages/web/src/main.ts': "import './styles/design-tokens.css';",
    'apps/nostar/src/main.tsx': "import './design-tokens.css';",
    'apps/nomoney/frontend/src/main.tsx': "import './design-tokens.css';",
    'apps/clipper/src/main.tsx': "import './design-tokens.css';",
  };
  for (const [entry, statement] of Object.entries(entries)) {
    assert.ok(read(entry).includes(statement), `${entry} must import its design tokens`);
  }

  // The token file declares custom properties only, so importing it into NoMoney cannot change
  // any Tailwind-generated rule — its appearance stays exactly as approved.
  const tokens = read(CANONICAL);
  assert.ok(!/^\s*[.#a-z\[][^{]*\{/mi.test(tokens.replace(/:root[^{]*\{[\s\S]*?\n\}/g, '').replace(/@media[\s\S]*?\n\}\n\}/g, '')),
    'the token file must not contain element or class rules');
});

test('no app ships the retired shell layers or the purple palette', () => {
  const adminCss = read('packages/web/src/styles/admin.css');
  const adminLayout = read('packages/web/src/components/AdminLayout.vue');
  const nostarConfig = read('apps/nostar/tailwind.config.js');
  const nostarShell = read('apps/nostar/src/components/AppShell.tsx');

  // Nono admin: the five stacked skins are gone, not merely overridden.
  for (const marker of ['app-workbench', 'glass-workbench', 'figma-admin-shell', 'chatgpt-admin-shell', 'admin-glass-enabled']) {
    assert.ok(!adminCss.includes(marker), `admin.css still references ${marker}`);
    assert.ok(!adminLayout.includes(marker), `AdminLayout.vue still references ${marker}`);
  }
  assert.ok(adminLayout.includes('class="admin-shell"'), 'the admin shell must be a single class');

  // NoStar: the Linear palette is gone and the frame is the shared shell.
  for (const purple of ['#5e6ad2', '#7170ff', '#828fff']) {
    assert.ok(!nostarConfig.toLowerCase().includes(purple), `${purple} is back in the NoStar palette`);
  }
  assert.ok(!fs.existsSync(path.join(root, 'apps/nostar/src/components/Header.tsx')),
    'the header-centric frame must be gone');
  assert.ok(nostarShell.includes('nostar-sidebar'), 'NoStar must render the shared sidebar shell');
});

test('decorative treatments are absent from every shell stylesheet', () => {
  for (const sheet of ['packages/web/src/styles/admin.css', 'apps/nostar/src/index.css']) {
    const css = read(sheet);
    assert.ok(!css.includes('linear-gradient'), `${sheet} still uses a gradient`);
    assert.ok(!css.includes('backdrop-filter: blur('), `${sheet} still uses glass blur`);
  }
  // The admin sheet takes every colour from the contract.
  assert.deepEqual(read('packages/web/src/styles/admin.css').match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], []);
});

test('the three shells agree on geometry', () => {
  const adminCss = read('packages/web/src/styles/admin.css');
  const nostarCss = read('apps/nostar/src/index.css');
  const nomoneyLayout = read('apps/nomoney/frontend/src/Layout.tsx');

  for (const css of [adminCss, nostarCss]) {
    assert.match(css, /width:\s*var\(--ui-sidebar-w\)/);
    assert.match(css, /min-height:\s*var\(--ui-topbar-h\)/);
    assert.match(css, /max-width:\s*var\(--ui-content-max\)/);
    assert.match(css, /@media \(max-width: 767px\)/);
  }
  // NoMoney expresses the same geometry in Tailwind: w-64 sidebar, min-h-16 topbar, md drawer.
  assert.ok(nomoneyLayout.includes('w-64'), 'NoMoney sidebar width changed');
  assert.ok(nomoneyLayout.includes('min-h-16'), 'NoMoney topbar height changed');
  assert.ok(nomoneyLayout.includes('md:pl-64'), 'NoMoney content offset changed');
});
