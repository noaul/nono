import fs from 'node:fs';
import path from 'node:path';

/** AssetPage plus the per-asset-type modules split out of it, for source contract tests. */
export function readAssetPageSource(): string {
  const root = path.resolve(process.cwd(), 'src');
  const parts = ['AssetPage.tsx', ...['shared', 'phone', 'vps', 'domain', 'forms'].map((name) => `asset-page/${name}.tsx`)];
  return parts.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
}
