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

export function buildSavePayload(pageInfo, analysis, fields) {
  const folderId = Number(fields.folderId || analysis?.suggestedFolderId || 0);
  const folderName = String(fields.folderName || '').trim() || (!folderId ? analysis?.suggestedFolderName : '');
  return {
    ...pageInfo,
    ...(folderId ? { folderId } : {}),
    ...(folderName ? { folderName } : {}),
    name: String(fields.name || analysis?.suggestedName || pageInfo.title || '').trim(),
    description: String(fields.description || analysis?.suggestedDescription || pageInfo.description || '').trim(),
  };
}

export function healthStatusText(result) {
  if (!result) return '未检查链接健康状态';
  const code = result.statusCode ? ` · ${result.statusCode}` : '';
  if (result.status === 'ok') return `链接可访问${code}`;
  if (result.status === 'timeout') return '链接检查超时';
  if (result.status === 'invalid') return '链接格式无效';
  return `链接异常${code}`;
}
