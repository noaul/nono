import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ZipArchive } from 'archiver';
import { packageOutputDirectory } from './package-output.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const artifacts = packageOutputDirectory(process.argv.slice(2), root);
const stableTimestamp = new Date('2026-01-01T00:00:00.000Z');

const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'Extension build failed');

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(dist, 'manifest.json'), 'utf8'));
if (packageJson.version !== manifest.version) {
  throw new Error(`Extension version mismatch: package ${packageJson.version}, manifest ${manifest.version}`);
}

await fs.mkdir(artifacts, { recursive: true });
const unpackedPath = path.join(artifacts, `nono-quick-bookmark-chrome-v${manifest.version}`);
await fs.rm(unpackedPath, { recursive: true, force: true });
await fs.cp(dist, unpackedPath, { recursive: true });
const outputPath = path.join(artifacts, `nono-quick-bookmark-chrome-v${manifest.version}.zip`);
const files = await listFiles(dist);
const entries = [];
for (const file of files) {
  entries.push({ file, content: await fs.readFile(path.join(dist, file)) });
}

await new Promise((resolve, reject) => {
  const output = createWriteStream(outputPath, { mode: 0o600 });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('warning', reject);
  archive.on('error', reject);
  archive.pipe(output);
  for (const entry of entries) {
    archive.append(entry.content, { name: entry.file.replaceAll(path.sep, '/'), date: stableTimestamp, mode: 0o644 });
  }
  archive.finalize();
});

const content = await fs.readFile(outputPath);
if (content.length < 4 || content.subarray(0, 4).toString('hex') !== '504b0304') {
  throw new Error('Extension package is not a valid ZIP archive');
}
console.log(`Packaged extension into ${unpackedPath} and ${outputPath}`);

async function listFiles(directory, prefix = '') {
  const entries = await fs.readdir(path.join(directory, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(directory, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}
