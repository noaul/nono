/**
 * 为 public/theme-scenes 下的主题场景底图生成 WebP 版本。
 *
 * 这些底图是导航页首屏最大的单个资源（原图合计约 1.2 MB），WebP 通常能省 60%~75%。
 * 原图会保留，ThemeScene.vue 用 <picture> 引用，浏览器不支持 WebP 时自动回退。
 *
 * 生成结果已提交进仓库，所以构建和运行都不需要 sharp——它只在更换场景底图时才用到，
 * 不作为 devDependency（sharp 带 libvips 二进制约 20 MB，会被 Dockerfile 一并打进运行镜像）。
 * 需要重新生成时先临时安装：
 *
 *   npm i -D --no-save sharp -w packages/web
 *   npm run optimize:scenes -w packages/web
 */
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const sceneDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/theme-scenes');
const QUALITY = 82;

const entries = (await readdir(sceneDir)).filter((name) => /\.(jpe?g|png)$/i.test(name));
if (entries.length === 0) {
  console.log('no source images found in', sceneDir);
  process.exit(0);
}

let before = 0;
let after = 0;

for (const name of entries.sort()) {
  const source = path.join(sceneDir, name);
  const target = path.join(sceneDir, `${name.replace(/\.[^.]+$/, '')}.webp`);
  const buffer = await sharp(source).webp({ quality: QUALITY, effort: 6 }).toBuffer();
  await writeFile(target, buffer);

  const sourceSize = (await stat(source)).size;
  before += sourceSize;
  after += buffer.length;
  const saved = ((1 - buffer.length / sourceSize) * 100).toFixed(1);
  console.log(`${name.padEnd(24)} ${kb(sourceSize).padStart(9)} -> ${kb(buffer.length).padStart(9)}  (-${saved}%)`);
}

console.log(`\ntotal ${kb(before)} -> ${kb(after)}  (-${((1 - after / before) * 100).toFixed(1)}%)`);

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}
