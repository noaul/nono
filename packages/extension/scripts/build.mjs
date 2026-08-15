import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

/**
 * Three execution contexts, two output formats.
 *
 * The content script is injected into the page by `chrome.scripting`, and Chrome cannot inject an
 * ES module that way — module syntax there fails silently in the page. It must be an IIFE. The
 * background service worker and the popup are declared as modules, so they stay ESM.
 */
const BUNDLES = [
  { entry: 'content.js', outfile: 'content.js', format: 'iife' },
  { entry: 'background.js', outfile: 'background.js', format: 'esm' },
  { entry: 'popup/popup.js', outfile: 'popup/popup.js', format: 'esm' },
];

const COPIES = ['manifest.json', 'popup/popup.html', 'popup/popup.css'];
const TREES = ['icons', '_locales'];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

for (const bundle of BUNDLES) {
  await build({
    entryPoints: [path.join(root, bundle.entry)],
    outfile: path.join(dist, bundle.outfile),
    bundle: true,
    format: bundle.format,
    target: 'chrome110',
    platform: 'browser',
    legalComments: 'none',
    logLevel: 'warning',
  });
}

for (const file of COPIES) {
  const target = path.join(dist, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(path.join(root, file), target);
}

// Chrome reads manifest __MSG_*__ placeholders from _locales.
for (const tree of TREES) {
  await fs.cp(path.join(root, tree), path.join(dist, tree), { recursive: true });
}

const manifest = JSON.parse(await fs.readFile(path.join(dist, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required');

// The bundles are self-contained, so shipping the source modules would only enlarge the package
// and confuse store review.
await assertAbsent(path.join(dist, 'shared'));

const contentScript = await fs.readFile(path.join(dist, 'content.js'), 'utf8');
if (/^\s*(import|export)\s/m.test(contentScript)) {
  throw new Error('Content script must not contain module syntax; it is injected as a classic script');
}

console.log(`Built extension into ${dist}`);

async function assertAbsent(target) {
  try {
    await fs.stat(target);
  } catch {
    return;
  }
  throw new Error(`${target} must not be present in the build output`);
}
