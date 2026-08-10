import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_RESOURCES = {
  about: 'src/app/about/list.json',
  bloggers: 'src/app/bloggers/list.json',
  pictures: 'src/app/pictures/list.json',
  projects: 'src/app/projects/list.json',
  share: 'src/app/share/list.json',
  shares: 'src/app/share/list.json',
  snippets: 'src/app/snippets/list.json',
  site: 'src/config/site-content.json',
  'site-content': 'src/config/site-content.json',
  'card-styles': 'src/config/card-styles.json',
  blogs: 'public/blogs/index.json',
  'blog-categories': 'public/blogs/categories.json',
} as const;

const APP_LIST_PATH = /^src\/app\/(about|bloggers|pictures|projects|share|snippets)\/list\.json$/;
const CONFIG_PATH = /^src\/config\/(site-content|card-styles)\.json$/;
const BLOG_ROOT_PATH = /^public\/blogs\/(index|categories)\.json$/;
const BLOG_CONTENT_PATH = /^public\/blogs\/[^/]+\/(index\.md|config\.json|[^/]+\.(avif|gif|jpe?g|png|webp))$/i;
const IMAGE_PATH = /^public\/images\/(art|background|blogger|pictures|project|share|social-buttons)\/[^/]+\.(avif|gif|jpe?g|png|svg|webp)$/i;
const ROOT_IMAGE_PATH = /^public\/(favicon\.png|images\/avatar(?:-[a-f0-9]{64})?\.(avif|gif|jpe?g|png|webp))$/i;

const LIST_DIRECTORIES = [
  /^src\/app\/(about|bloggers|pictures|projects|share|snippets)$/,
  /^src\/config$/,
  /^public\/blogs(?:\/[^/]+)?$/,
  /^public\/images\/(art|background|blogger|pictures|project|share|social-buttons)$/,
];

export type NodeskBatchFile = {
  path: string;
  contentBase64: string | null;
};

export class NodeskContentStore {
  private readonly root: string;

  constructor(contentDir: string) {
    this.root = path.resolve(contentDir);
  }

  publicPath(resource: string) {
    return PUBLIC_RESOURCES[resource as keyof typeof PUBLIC_RESOURCES] || null;
  }

  async readPublicJson(resource: string) {
    const logicalPath = this.publicPath(resource);
    if (!logicalPath) throw httpError(404, 'NoDesk content resource not found');
    const content = await this.read(logicalPath);
    try {
      return JSON.parse(content.toString('utf8'));
    } catch {
      throw httpError(500, 'NoDesk content is not valid JSON');
    }
  }

  async read(logicalPath: string) {
    const target = this.resolveFile(logicalPath);
    await this.assertNoSymlink(target);
    try {
      return await fs.readFile(target);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) throw httpError(404, 'NoDesk content file not found');
      throw error;
    }
  }

  async list(logicalPath: string) {
    const normalized = normalizeLogicalPath(logicalPath);
    if (!LIST_DIRECTORIES.some(pattern => pattern.test(normalized))) {
      throw httpError(400, 'NoDesk content directory is not allowed');
    }

    const target = resolveWithin(this.root, normalized);
    await this.assertNoSymlink(target);
    const files: string[] = [];
    await this.collectFiles(target, normalized, files);
    return files.sort();
  }

  async batch(files: unknown) {
    if (!Array.isArray(files) || files.length === 0) throw httpError(400, 'At least one NoDesk content file is required');

    const entries = files.map((input: unknown) => {
      const file = input as Partial<NodeskBatchFile> | null;
      if (!file || typeof file.path !== 'string' || (typeof file.contentBase64 !== 'string' && file.contentBase64 !== null)) {
        throw httpError(400, 'Invalid NoDesk content file');
      }
      const normalized = normalizeLogicalPath(file.path);
      if (!isAllowedFile(normalized)) throw httpError(400, 'NoDesk content path is not allowed');
      return {
        logicalPath: normalized,
        target: resolveWithin(this.root, normalized),
        content: file.contentBase64 === null ? null : decodeBase64(file.contentBase64),
      };
    });

    if (new Set(entries.map(entry => entry.logicalPath)).size !== entries.length) {
      throw httpError(400, 'Duplicate NoDesk content path');
    }

    const staged: Array<{ target: string; temp: string }> = [];
    try {
      for (const entry of entries) {
        await this.assertNoSymlink(entry.target);
        if (entry.content === null) continue;
        await fs.mkdir(path.dirname(entry.target), { recursive: true });
        await this.assertNoSymlink(entry.target);
        const temp = path.join(path.dirname(entry.target), `.${path.basename(entry.target)}.${randomUUID()}.tmp`);
        await fs.writeFile(temp, entry.content, { flag: 'wx' });
        staged.push({ target: entry.target, temp });
      }

      for (const entry of entries) {
        if (entry.content === null) {
          await fs.rm(entry.target, { force: true });
          continue;
        }
        const stagedFile = staged.find(item => item.target === entry.target);
        if (!stagedFile) throw new Error('NoDesk content staging failed');
        await fs.rename(stagedFile.temp, entry.target);
      }
    } finally {
      await Promise.all(staged.map(item => fs.rm(item.temp, { force: true })));
    }

    return entries.map(entry => entry.logicalPath);
  }

  private resolveFile(logicalPath: string) {
    const normalized = normalizeLogicalPath(logicalPath);
    if (!isAllowedFile(normalized)) throw httpError(400, 'NoDesk content path is not allowed');
    return resolveWithin(this.root, normalized);
  }

  private async collectFiles(directory: string, logicalDirectory: string, output: string[]) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return;
      throw error;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw httpError(400, 'Symbolic links are not allowed in NoDesk content');
      const logicalPath = `${logicalDirectory}/${entry.name}`;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.collectFiles(target, logicalPath, output);
      } else if (entry.isFile() && isAllowedFile(logicalPath)) {
        output.push(logicalPath);
      }
    }
  }

  private async assertNoSymlink(target: string) {
    const relative = path.relative(this.root, target);
    let current = this.root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try {
        const stats = await fs.lstat(current);
        if (stats.isSymbolicLink()) throw httpError(400, 'Symbolic links are not allowed in NoDesk content');
      } catch (error) {
        if (hasCode(error, 'ENOENT')) return;
        throw error;
      }
    }
  }
}

function isAllowedFile(logicalPath: string) {
  return APP_LIST_PATH.test(logicalPath) || CONFIG_PATH.test(logicalPath) || BLOG_ROOT_PATH.test(logicalPath) || BLOG_CONTENT_PATH.test(logicalPath) || IMAGE_PATH.test(logicalPath) || ROOT_IMAGE_PATH.test(logicalPath);
}

function normalizeLogicalPath(input: string) {
  const value = input.trim();
  if (!value || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw httpError(400, 'Invalid NoDesk content path');
  }
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw httpError(400, 'Invalid NoDesk content path');
  }
  return segments.join('/');
}

function resolveWithin(root: string, logicalPath: string) {
  const target = path.resolve(root, ...logicalPath.split('/'));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw httpError(400, 'Invalid NoDesk content path');
  return target;
}

function decodeBase64(input: string) {
  if (input.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) {
    throw httpError(400, 'Invalid base64 content');
  }
  return Buffer.from(input, 'base64');
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function hasCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
