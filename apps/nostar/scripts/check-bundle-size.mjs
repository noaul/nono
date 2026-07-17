import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(appDir, 'dist');
const manifest = JSON.parse(readFileSync(resolve(distDir, '.vite', 'manifest.json'), 'utf8'));
const maxInitialGzipBytes = Number(process.env.NOSTAR_MAX_INITIAL_JS_GZIP_KB || 150) * 1024;
const maxDefaultRouteGzipBytes = Number(process.env.NOSTAR_MAX_DEFAULT_ROUTE_JS_GZIP_KB || 200) * 1024;
const maxChunkGzipBytes = Number(process.env.NOSTAR_MAX_CHUNK_GZIP_KB || 180) * 1024;

const entryKeys = Object.entries(manifest)
  .filter(([, chunk]) => chunk.isEntry && chunk.file.endsWith('.js'))
  .map(([key]) => key);

if (entryKeys.length === 0) {
  throw new Error('No JavaScript entry was found in the NoStar build manifest');
}

const collectStaticFiles = (keys) => {
  const files = new Set();
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || files.has(chunk.file)) return;
    if (chunk.file.endsWith('.js')) files.add(chunk.file);
    for (const importedKey of chunk.imports || []) visit(importedKey);
  };
  for (const key of keys) visit(key);
  return files;
};

const defaultRouteKey = 'src/views/RepositoriesView.tsx';
if (!manifest[defaultRouteKey]) {
  throw new Error(`NoStar default route was not found in the build manifest: ${defaultRouteKey}`);
}

const initialFiles = collectStaticFiles(entryKeys);
const defaultRouteFiles = collectStaticFiles([...entryKeys, defaultRouteKey]);

const measureFiles = (files) => [...files]
  .map((file) => {
    const source = readFileSync(resolve(distDir, file));
    return { file, rawBytes: source.byteLength, gzipBytes: gzipSync(source).byteLength };
  })
  .sort((left, right) => right.gzipBytes - left.gzipBytes);

const measurements = measureFiles(initialFiles);
const defaultRouteMeasurements = measureFiles(defaultRouteFiles);
const allJavaScriptFiles = new Set(
  Object.values(manifest)
    .map((chunk) => chunk.file)
    .filter((file) => file.endsWith('.js')),
);
const allMeasurements = measureFiles(allJavaScriptFiles);

const totalRawBytes = measurements.reduce((total, item) => total + item.rawBytes, 0);
const totalGzipBytes = measurements.reduce((total, item) => total + item.gzipBytes, 0);
const defaultRouteGzipBytes = defaultRouteMeasurements.reduce((total, item) => total + item.gzipBytes, 0);
const toKiB = (bytes) => (bytes / 1024).toFixed(1);

console.log(`NoStar initial JavaScript: ${toKiB(totalRawBytes)} KiB raw, ${toKiB(totalGzipBytes)} KiB gzip`);
for (const item of measurements) {
  console.log(`  ${item.file}: ${toKiB(item.rawBytes)} KiB raw, ${toKiB(item.gzipBytes)} KiB gzip`);
}
console.log(`NoStar default repositories route: ${toKiB(defaultRouteGzipBytes)} KiB gzip`);
console.log(`Largest JavaScript chunk: ${allMeasurements[0].file}, ${toKiB(allMeasurements[0].gzipBytes)} KiB gzip`);

if (totalGzipBytes > maxInitialGzipBytes) {
  console.error(`Initial JavaScript exceeds the ${toKiB(maxInitialGzipBytes)} KiB gzip budget`);
  process.exit(1);
}

if (defaultRouteGzipBytes > maxDefaultRouteGzipBytes) {
  console.error(`Default repositories route exceeds the ${toKiB(maxDefaultRouteGzipBytes)} KiB gzip budget`);
  process.exit(1);
}

if (allMeasurements[0].gzipBytes > maxChunkGzipBytes) {
  console.error(`Largest JavaScript chunk exceeds the ${toKiB(maxChunkGzipBytes)} KiB gzip budget`);
  process.exit(1);
}
