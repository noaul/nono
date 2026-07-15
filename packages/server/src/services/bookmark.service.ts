import type { FolderRecord, LinkRecord, Repository } from './repository.js';
import { createSortOrder } from '../utils/sort-order.js';

export interface BookmarkImportPreview {
  summary: {
    parsedFolders: number;
    parsedLinks: number;
    newFolders: number;
    newLinks: number;
    duplicateLinks: number;
    invalidLinks: number;
    ignoredFolders: number;
    ignoredLinks: number;
  };
  folders: Array<{ tempId: string; parentTempId: string | null; name: string; status: 'new' }>;
  links: Array<{ tempId: string; name: string; url: string; folderTempId: string | null; status: 'new' | 'duplicate' | 'invalid'; reason?: string }>;
}

export interface BookmarkImportSelection {
  folderTempIds?: string[];
  linkTempIds?: string[];
}

export function parseBookmarksHtml(html: string) {
  const folders: Array<{ tempId: string; parentTempId: string | null; name: string }> = [];
  const links: Array<{ tempId: string; folderTempId: string | null; name: string; url: string; icon?: string }> = [];
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
      links.push({ tempId: `link-${links.length + 1}`, folderTempId: stack.at(-1) || null, name: decodeHtml(stripTags(match[4])).trim() || url, url: decodeHtml(url), icon: attrs.icon_uri || attrs.icon || '' });
    } else if (stack.length > 0) {
      stack.pop();
    }
  }
  return scopeBookmarksTree(folders, links);
}

export function exportBookmarksHtml(folders: FolderRecord[], links: LinkRecord[]) {
  const lines = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Nono Bookmarks</TITLE>', '<H1>Nono Bookmarks</H1>', '<DL><p>'];
  appendFolderLevel(lines, folders, links, null, 1);
  lines.push('</DL><p>');
  return `${lines.join('\n')}\n`;
}

export async function importBookmarks(repo: Repository, userId: number, html: string, selection?: BookmarkImportSelection) {
  const parsed = parseBookmarksHtml(html);
  const selectedFolderTempIds = selectedIds(selection?.folderTempIds, parsed.folders.map((folder) => folder.tempId));
  const selectedLinkTempIds = selectedIds(selection?.linkTempIds, parsed.links.map((link) => link.tempId));
  const selectedFolders = parsed.folders.filter((folder) => selectedFolderTempIds.has(folder.tempId));
  const selectedLinks = parsed.links.filter((link) => selectedLinkTempIds.has(link.tempId));
  const folderByTempId = new Map(parsed.folders.map((folder) => [folder.tempId, folder]));
  const folders = await repo.listFolders(userId);
  const links = await repo.listLinks(userId);
  const existingUrls = new Set(links.map((link) => link.url.toLowerCase()));
  const tempToId = new Map<string, number>();
  const summary = { addedFolders: 0, addedLinks: 0, skippedDuplicates: 0, skippedInvalid: 0 };

  for (const [index, item] of selectedFolders.entries()) {
    const selectedParentTempId = nearestSelectedFolder(item.parentTempId, selectedFolderTempIds, folderByTempId);
    const folder = await repo.createFolder({
      userId,
      parentId: selectedParentTempId ? tempToId.get(selectedParentTempId) || null : null,
      name: item.name,
      icon: '',
      description: '',
      sortOrder: createSortOrder(index),
      passwordHash: null,
      passwordHint: null,
    });
    tempToId.set(item.tempId, folder.id);
    summary.addedFolders += 1;
  }

  let fallbackFolderId = folders[0]?.id;
  if (!fallbackFolderId && selectedLinks.length > 0) {
    fallbackFolderId = selectedFolders[0] ? tempToId.get(selectedFolders[0].tempId) : undefined;
    if (!fallbackFolderId) {
      const folder = await repo.createFolder({ userId, parentId: null, name: '导入书签', icon: 'folder', description: '', sortOrder: createSortOrder(), passwordHash: null, passwordHint: null });
      fallbackFolderId = folder.id;
      summary.addedFolders += 1;
    }
  }

  for (const [index, item] of selectedLinks.entries()) {
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
    const selectedFolderTempId = nearestSelectedFolder(item.folderTempId, selectedFolderTempIds, folderByTempId);
    await repo.createLink({
      folderId: selectedFolderTempId ? tempToId.get(selectedFolderTempId) || fallbackFolderId : fallbackFolderId,
      name: item.name,
      url: normalizedUrl,
      icon: normalizeImportedIcon(item.icon),
      description: '',
      sortOrder: createSortOrder(index),
    });
    existingUrls.add(key);
    summary.addedLinks += 1;
  }

  return summary;
}

export async function previewBookmarksImport(repo: Repository, userId: number, html: string): Promise<BookmarkImportPreview> {
  const parsed = parseBookmarksHtml(html);
  const existingLinks = await repo.listLinks(userId);
  const existingUrls = new Set(existingLinks.map((link) => link.url.toLowerCase()));
  const links = parsed.links.map((item) => {
    const normalizedUrl = tryNormalizeUrl(item.url);
    if (!normalizedUrl) {
      return {
        tempId: item.tempId,
        name: item.name,
        url: item.url,
        folderTempId: item.folderTempId,
        status: 'invalid' as const,
        reason: 'URL must start with http:// or https://',
      };
    }
    if (existingUrls.has(normalizedUrl.toLowerCase())) {
      return {
        tempId: item.tempId,
        name: item.name,
        url: normalizedUrl,
        folderTempId: item.folderTempId,
        status: 'duplicate' as const,
        reason: 'URL already exists',
      };
    }
    existingUrls.add(normalizedUrl.toLowerCase());
    return { tempId: item.tempId, name: item.name, url: normalizedUrl, folderTempId: item.folderTempId, status: 'new' as const };
  });

  return {
    summary: {
      parsedFolders: parsed.folders.length,
      parsedLinks: parsed.links.length,
      newFolders: parsed.folders.length,
      newLinks: links.filter((link) => link.status === 'new').length,
      duplicateLinks: links.filter((link) => link.status === 'duplicate').length,
      invalidLinks: links.filter((link) => link.status === 'invalid').length,
      ignoredFolders: parsed.ignoredFolders,
      ignoredLinks: parsed.ignoredLinks,
    },
    folders: parsed.folders.map((folder) => ({ ...folder, status: 'new' as const })),
    links,
  };
}

function scopeBookmarksTree(
  folders: Array<{ tempId: string; parentTempId: string | null; name: string }>,
  links: Array<{ tempId: string; folderTempId: string | null; name: string; url: string; icon?: string }>,
) {
  const wrapper = folders.find((folder) => !folder.parentTempId && isBookmarksWrapper(folder.name));
  if (!wrapper) return { folders, links, ignoredFolders: 0, ignoredLinks: 0 };

  const includedFolderIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentTempId === wrapper.tempId || (folder.parentTempId && includedFolderIds.has(folder.parentTempId))) {
        if (!includedFolderIds.has(folder.tempId)) {
          includedFolderIds.add(folder.tempId);
          changed = true;
        }
      }
    }
  }

  const scopedFolders = folders
    .filter((folder) => includedFolderIds.has(folder.tempId))
    .map((folder) => ({ ...folder, parentTempId: folder.parentTempId === wrapper.tempId ? null : folder.parentTempId }));
  const scopedLinks = links
    .filter((link) => link.folderTempId === wrapper.tempId || Boolean(link.folderTempId && includedFolderIds.has(link.folderTempId)))
    .map((link) => ({ ...link, folderTempId: link.folderTempId === wrapper.tempId ? null : link.folderTempId }));

  return {
    folders: scopedFolders,
    links: scopedLinks,
    ignoredFolders: folders.length - scopedFolders.length - 1,
    ignoredLinks: links.length - scopedLinks.length,
  };
}

function isBookmarksWrapper(name: string) {
  return ['bookmarks', 'bookmarks bar', '书签', '书签栏'].includes(name.trim().toLowerCase());
}

function selectedIds(selection: string[] | undefined, availableIds: string[]) {
  const available = new Set(availableIds);
  if (selection === undefined) return available;
  return new Set(selection.filter((id) => available.has(id)));
}

function nearestSelectedFolder(
  tempId: string | null,
  selectedFolderTempIds: Set<string>,
  folderByTempId: Map<string, { parentTempId: string | null }>,
) {
  let cursor = tempId;
  while (cursor) {
    if (selectedFolderTempIds.has(cursor)) return cursor;
    cursor = folderByTempId.get(cursor)?.parentTempId || null;
  }
  return null;
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
