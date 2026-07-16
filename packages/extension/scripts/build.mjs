import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const required = ['manifest.json', 'background.js', 'content.js', 'popup/popup.html', 'popup/popup.js', 'popup/popup.css'];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

for (const file of required) {
  const source = path.join(root, file);
  const target = path.join(dist, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

await fs.cp(path.join(root, 'shared'), path.join(dist, 'shared'), { recursive: true });
await fs.cp(path.join(root, 'icons'), path.join(dist, 'icons'), { recursive: true });

const manifest = JSON.parse(await fs.readFile(path.join(dist, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required');
console.log(`Built extension into ${dist}`);
