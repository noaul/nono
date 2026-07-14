export function normalizeServerUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function normalizeBookmarkUrl(value) {
  try {
    return new URL(String(value || '').trim()).href.toLowerCase();
  } catch {
    return String(value || '').trim().toLowerCase();
  }
}

export function findDuplicateLink(links, url) {
  const target = normalizeBookmarkUrl(url);
  return links.find((link) => normalizeBookmarkUrl(link.url) === target) || null;
}

export function tokenExpiryText(token, now = new Date()) {
  if (!token?.expiresAt) return 'Token 不过期';
  const expiresAt = new Date(token.expiresAt);
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return 'Token 已过期';
  const days = Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  return `Token 还有 ${days} 天过期`;
}

export function buildFolderGroups(folders) {
  const ordered = [...folders].sort((left, right) => Number(right.sortOrder || 0) - Number(left.sortOrder || 0));
  const roots = ordered.filter((folder) => !folder.parentId);
  const childrenByParent = new Map(roots.map((folder) => [String(folder.id), []]));
  const orphanFolders = [];

  for (const folder of ordered.filter((folder) => folder.parentId)) {
    const children = childrenByParent.get(String(folder.parentId));
    if (children) children.push(folder);
    else orphanFolders.push(folder);
  }

  const groups = roots.map((root) => {
    const children = childrenByParent.get(String(root.id)) || [];
    return { category: root, folders: children.length ? children : [root] };
  });

  if (orphanFolders.length) groups.push({ category: { id: '__other__', name: '其他文件夹' }, folders: orphanFolders });
  return groups;
}

export function findFolderGroup(groups, folderId) {
  return groups.find((group) => group.folders.some((folder) => String(folder.id) === String(folderId))) || groups[0] || null;
}

export function preferredFolderId(groups, lastFolderId) {
  const hasLastFolder = groups.some((group) => group.folders.some((folder) => String(folder.id) === String(lastFolderId)));
  if (hasLastFolder) return String(lastFolderId);
  return String(groups[0]?.folders[0]?.id || '');
}

export function buildQuickSavePayload(pageInfo, fields) {
  return {
    folderId: Number(fields.folderId),
    name: String(fields.name || pageInfo.title || new URL(pageInfo.url).hostname).trim(),
    url: pageInfo.url,
    description: String(fields.description || pageInfo.description || '').trim(),
  };
}
