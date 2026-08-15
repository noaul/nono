import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * Clipper ships a single entry bundle rather than NoStar's route-split chunks, so this only guards
 * the initial payload. Split the budget out per route if lazy routes are ever added.
 */
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(appDir, 'dist');
const manifest = JSON.parse(readFileSync(resolve(distDir, '.vite', 'manifest.json'), 'utf8'));

const maxInitialGzipBytes = Number(process.env.CLIPPER_MAX_INITIAL_JS_GZIP_KB || 120) * 1024;
const maxCssGzipBytes = Number(process.env.CLIPPER_MAX_CSS_GZIP_KB || 30) * 1024;

const entries = Object.values(manifest).filter((chunk) => chunk.isEntry && chunk.file.endsWith('.js'));
if (entries.length === 0) {
  throw new Error('No JavaScript entry was found in the Clipper build manifest');
}

const collect = (chunk, seen = new Set()) => {
  if (!chunk || seen.has(chunk.file)) return seen;
  seen.add(chunk.file);
  for (const key of chunk.imports || []) collect(manifest[key], seen);
  return seen;
};

const jsFiles = new Set();
const cssFiles = new Set();
for (const entry of entries) {
  for (const file of collect(entry)) jsFiles.add(file);
  for (const file of entry.css || []) cssFiles.add(file);
}

const gzipOf = (files) => [...files].reduce((total, file) => {
  const source = readFileSync(resolve(distDir, file));
  return total + gzipSync(source).byteLength;
}, 0);

const jsGzip = gzipOf(jsFiles);
const cssGzip = gzipOf(cssFiles);

const report = (label, actual, budget) => {
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  if (actual > budget) {
    throw new Error(`Clipper ${label} bundle is ${kb(actual)} gzipped, over the ${kb(budget)} budget`);
  }
  console.log(`Clipper ${label}: ${kb(actual)} gzipped (budget ${kb(budget)})`);
};

report('initial JS', jsGzip, maxInitialGzipBytes);
report('CSS', cssGzip, maxCssGzipBytes);
