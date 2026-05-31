import type { FolderRecord, LinkRecord, Repository } from './repository.js';
import { createSortOrder } from '../utils/sort-order.js';

export function parseBookmarksHtml(html: string) {
  const folders: Array<{ tempId: string; parentTempId: string | null; name: string }> = [];
  const links: Array<{ folderTempId: string | null; name: string; url: string; icon?: string }> = [];
  const stack: string[] = [];
  const tokenPattern = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DT>\s*<A([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi;
  let match;
  while ((match = tokenPattern.exec(html))) {
    if (match[1] !== undefined) {
      const folder = { tempId: `folder-${folders.length + 1}`, parentTempId: stack.at(-1) || null, name: decodeHtml(stripTags(match[2])).trim() || '未命名文件夹' };
      folders.push(folder);
      stack.push(folder.tempId);
    } else if (match[3] !== undefined) {
      const attrs = parseAttributes(match[3]);
      const url = attrs.href || '';
      if (!url) continue;
      links.push({ folderTempId: stack.at(-1) || null, name: decodeHtml(stripTags(match[4])).trim() || url, url: decodeHtml(url), icon: attrs.icon_uri || attrs.icon || '' });
    } else if (stack.length > 0) {
      stack.pop();
    }
  }
  return { folders, links };
}

export function exportBookmarksHtml(folders: FolderRecord[], links: LinkRecord[]) {
  const lines = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Nono Bookmarks</TITLE>', '<H1>Nono Bookmarks</H1>', '<DL><p>'];
  appendFolderLevel(lines, folders, links, null, 1);
  lines.push('</DL><p>');
  return `${lines.join('\n')}\n`;
}

export async function importBookmarks(repo: Repository, userId: number, html: string) {
  const parsed = parseBookmarksHtml(html);
  const folders = await repo.listFolders(userId);
  const links = await repo.listLinks(userId);
  const existingUrls = new Set(links.map((link) => link.url.toLowerCase()));
  const tempToId = new Map<string, number>();
  const summary = { addedFolders: 0, addedLinks: 0, skippedDuplicates: 0, skippedInvalid: 0 };

  for (const item of parsed.folders) {
    const folder = await repo.createFolder({
      userId,
      parentId: item.parentTempId ? tempToId.get(item.parentTempId) || null : null,
      name: item.name,
      icon: '',
      description: '',
      sortOrder: createSortOrder(summary.addedFolders),
      passwordHash: null,
      passwordHint: null,
    });
    tempToId.set(item.tempId, folder.id);
    summary.addedFolders += 1;
  }

  let fallbackFolderId = folders[0]?.id;
  if (!fallbackFolderId && parsed.links.length > 0) {
    fallbackFolderId = parsed.folders[0] ? tempToId.get(parsed.folders[0].tempId) : undefined;
    if (!fallbackFolderId) {
      const folder = await repo.createFolder({ userId, parentId: null, name: '导入书签', icon: 'folder', description: '', sortOrder: 100, passwordHash: null, passwordHint: null });
      fallbackFolderId = folder.id;
      summary.addedFolders += 1;
    }
  }

  for (const item of parsed.links) {
    const normalizedUrl = tryNormalizeUrl(item.url);
    if (!normalizedUrl) {
      summary.skippedInvalid += 1;
      continue;
    }
    const key = normalizedUrl.toLowerCase();
    if (existingUrls.has(key)) {
      summary.skippedDuplicates += 1;
      continue;
    }
    if (!fallbackFolderId) throw Object.assign(new Error('No target folder available'), { statusCode: 400 });
    await repo.createLink({
      folderId: item.folderTempId ? tempToId.get(item.folderTempId) || fallbackFolderId : fallbackFolderId,
      name: item.name,
      url: normalizedUrl,
      icon: normalizeImportedIcon(item.icon),
      description: '',
      sortOrder: createSortOrder(summary.addedLinks),
    });
    existingUrls.add(key);
    summary.addedLinks += 1;
  }

  return summary;
}

export function normalizeUrl(value: string) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw Object.assign(new Error('URL must start with http:// or https://'), { statusCode: 400 });
  return url.href;
}

function tryNormalizeUrl(value: string) {
  try {
    return normalizeUrl(value);
  } catch {
    return null;
  }
}

function normalizeImportedIcon(value: string | undefined) {
  const icon = String(value || '').trim();
  if (!icon || icon.length > 512 || icon.toLowerCase().startsWith('data:')) return '';
  return icon;
}

function appendFolderLevel(lines: string[], folders: FolderRecord[], links: LinkRecord[], parentId: number | null, depth: number) {
  const pad = '  '.repeat(depth);
  for (const folder of folders.filter((item) => (item.parentId ?? null) === parentId).sort(sortOrder)) {
    lines.push(`${pad}<DT><H3 ADD_DATE="${toUnixTime(folder.createdAt)}" LAST_MODIFIED="${toUnixTime(folder.updatedAt)}">${escapeHtml(folder.name)}</H3>`);
    lines.push(`${pad}<DL><p>`);
    for (const link of links.filter((item) => item.folderId === folder.id).sort(sortOrder)) {
      lines.push(`${pad}  <DT><A HREF="${escapeAttribute(link.url)}" ADD_DATE="${toUnixTime(link.createdAt)}" LAST_MODIFIED="${toUnixTime(link.updatedAt)}">${escapeHtml(link.name)}</A>`);
    }
    appendFolderLevel(lines, folders, links, folder.id, depth + 1);
    lines.push(`${pad}</DL><p>`);
  }
}

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttribute(value: unknown) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function decodeHtml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function stripTags(value: string) {
  return String(value || '').replace(/<[^>]+>/g, '');
}

function parseAttributes(value: string) {
  const attrs: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Za-z_:-]+)\s*=\s*"([^"]*)"/g)) attrs[match[1].toLowerCase()] = match[2];
  return attrs;
}

function toUnixTime(value: Date) {
  return Math.floor(new Date(value).getTime() / 1000);
}

function sortOrder(left: { sortOrder: number; id: number }, right: { sortOrder: number; id: number }) {
  return right.sortOrder - left.sortOrder || left.id - right.id;
}
