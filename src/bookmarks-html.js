export function parseBookmarksHtml(html) {
  const folders = [];
  const links = [];
  const stack = [];
  const tokenPattern = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DT>\s*<A([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi;
  let match;

  while ((match = tokenPattern.exec(html))) {
    if (match[1] !== undefined) {
      const folder = {
        tempId: `folder-${folders.length + 1}`,
        parentTempId: stack.at(-1) || null,
        name: decodeHtml(stripTags(match[2])).trim() || '未命名文件夹',
        icon: '',
        addDate: parseDateAttr(match[1], 'ADD_DATE'),
      };
      folders.push(folder);
      stack.push(folder.tempId);
    } else if (match[3] !== undefined) {
      const attrs = parseAttributes(match[3]);
      const url = attrs.href || attrs.HREF || '';
      if (!url) continue;
      links.push({
        folderTempId: stack.at(-1) || null,
        name: decodeHtml(stripTags(match[4])).trim() || url,
        url: decodeHtml(url),
        icon: attrs.icon_uri || attrs.ICON_URI || attrs.icon || attrs.ICON || '',
        addDate: parseDateAttr(match[3], 'ADD_DATE'),
      });
    } else if (stack.length > 0) {
      stack.pop();
    }
  }

  return { folders, links };
}

export function exportBookmarksHtml(state) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Nono Bookmarks</TITLE>',
    '<H1>Nono Bookmarks</H1>',
    '<DL><p>',
  ];
  const folders = [...state.folders].sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id);
  const links = [...state.links].sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id);
  appendFolderLevel(lines, folders, links, null, 1);
  lines.push('</DL><p>');
  return `${lines.join('\n')}\n`;
}

function appendFolderLevel(lines, folders, links, parentId, depth) {
  const pad = '  '.repeat(depth);
  for (const folder of folders.filter((item) => sameParent(item.parentId, parentId))) {
    const modified = toUnixTime(folder.updatedAt || folder.createdAt);
    lines.push(`${pad}<DT><H3 ADD_DATE="${toUnixTime(folder.createdAt)}" LAST_MODIFIED="${modified}">${escapeHtml(folder.name)}</H3>`);
    lines.push(`${pad}<DL><p>`);
    for (const link of links.filter((item) => item.folderId === folder.id)) {
      const attrs = [
        `HREF="${escapeAttribute(link.url)}"`,
        `ADD_DATE="${toUnixTime(link.createdAt)}"`,
        `LAST_MODIFIED="${toUnixTime(link.updatedAt || link.createdAt)}"`,
      ];
      if (link.icon) {
        attrs.push(`ICON_URI="${escapeAttribute(link.icon)}"`);
      }
      lines.push(`${pad}  <DT><A ${attrs.join(' ')}>${escapeHtml(link.name)}</A>`);
    }
    appendFolderLevel(lines, folders, links, folder.id, depth + 1);
    lines.push(`${pad}</DL><p>`);
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function stripTags(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '');
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttributes(value) {
  const attrs = {};
  for (const match of value.matchAll(/([A-Za-z_:-]+)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = match[2];
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function parseDateAttr(attrs, name) {
  const parsed = Number(parseAttributes(attrs)[name.toLowerCase()]);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed * 1000).toISOString() : '';
}

function toUnixTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? Math.floor(time / 1000) : Math.floor(Date.now() / 1000);
}

function sameParent(left, right) {
  return (left ?? null) === (right ?? null);
}
