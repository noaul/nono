import { t } from './i18n.js';

export function normalizeServerUrl(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) throw new Error(t('needServerUrl'));

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(t('needValidServerUrl'));
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const isSecure = url.protocol === 'https:';
  const isLoopbackDevelopment = url.protocol === 'http:' && loopbackHosts.has(url.hostname);
  if (!isSecure && !isLoopbackDevelopment) {
    throw new Error(t('needHttps'));
  }

  url.search = '';
  url.hash = '';
  return url.href.replace(/\/+$/, '');
}

export function serverOriginPattern(value) {
  const url = new URL(normalizeServerUrl(value));
  return `${url.origin}/*`;
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
  if (!token?.expiresAt) return t('tokenNeverExpires');
  const expiresAt = new Date(token.expiresAt);
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return t('tokenExpired');
  const days = Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  return t('tokenExpiresIn', { days });
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

  if (orphanFolders.length) groups.push({ category: { id: '__other__', name: t('otherFolders') }, folders: orphanFolders });
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
    nameMode: fields.nameMode === 'manual' ? 'manual' : 'auto',
    url: pageInfo.url,
    description: String(fields.description || pageInfo.description || '').trim(),
  };
}

export function buildUpdateBookmarkPayload(pageInfo, fields) {
  const { nameMode: _nameMode, ...payload } = buildQuickSavePayload(pageInfo, fields);
  return payload;
}

export function compactBookmarkName(value, rawUrl) {
  const fallback = siteNameFromUrl(rawUrl);
  let name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name || /^(home|homepage|index|welcome|untitled|首页|主页|欢迎页)$/i.test(name)) return fallback;
  name = name.split(/[|｜]/, 1)[0].trim();
  const segments = name.split(/\s+(?:—|–|-)\s+/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > 1) name = segments[0];
  return truncateToVisualWidth(name, 8);
}

function truncateToVisualWidth(value, maxWidth) {
  let width = 0;
  let result = '';
  let truncated = false;
  for (const character of value) {
    const characterWidth = /\s/.test(character) ? 0.25 : /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/u.test(character) ? 1 : /[A-Za-z0-9]/.test(character) ? 0.55 : 0.45;
    if (width + characterWidth > maxWidth) {
      truncated = true;
      break;
    }
    result += character;
    width += characterWidth;
  }
  if (!truncated) return result;
  if (/[A-Za-z0-9]$/.test(result)) {
    const previousSpace = result.lastIndexOf(' ');
    if (previousSpace > 0) return result.slice(0, previousSpace).trimEnd();
  }
  if (/[A-Za-z0-9]/.test(result) && /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/u.test([...result].at(-1) || '')) return [...result].slice(0, -1).join('').trimEnd();
  return result.trimEnd();
}

function siteNameFromUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
    const known = {
      'bilibili.com': '哔哩哔哩', 'chatgpt.com': 'ChatGPT', 'developer.mozilla.org': 'MDN', 'github.com': 'GitHub', 'juejin.cn': '掘金', 'openai.com': 'OpenAI', 'zhihu.com': '知乎',
    };
    const match = Object.entries(known).find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (match) return match[1];
    return hostname.split('.').at(-2) || hostname;
  } catch {
    return t('untitledBookmark');
  }
}

export const CLIP_MODES = ['bookmark', 'clip'];

export function isClipMode(value) {
  return CLIP_MODES.includes(value);
}

/**
 * Maps an extraction onto the /api/clipper/clips ingest contract.
 *
 * Content is not re-truncated here: the extractor already trimmed it to the byte budget and set
 * `contentTruncated`. The server re-checks and rejects anything still over the limit rather than
 * trusting that flag.
 */
export function buildClipPayload(article) {
  const payload = {
    url: article.url,
    title: article.title || article.canonicalUrl || article.url,
    contentHtml: article.contentHtml || '',
    contentMd: article.contentMd || '',
    contentTruncated: Boolean(article.contentTruncated),
    extractor: article.extractor || 'defuddle',
  };

  // Only send optional fields that carry a value. An empty canonicalUrl would fail URL validation
  // server-side instead of falling back to the page URL.
  if (article.canonicalUrl) payload.canonicalUrl = article.canonicalUrl;
  if (article.author) payload.author = article.author;
  if (article.siteName) payload.siteName = article.siteName;
  if (article.description) payload.description = article.description;
  if (article.lang) payload.lang = article.lang;
  if (article.favicon) payload.favicon = article.favicon;
  if (article.image) payload.image = article.image;
  if (article.publishedAt) payload.publishedAt = article.publishedAt;
  if (Number.isFinite(article.wordCount)) payload.wordCount = article.wordCount;
  if (article.sourceMeta) payload.sourceMeta = article.sourceMeta;

  return payload;
}

/**
 * Tokens created before Clipper existed carry no clip scopes, so the first clip attempt with one
 * fails with a bare 403. Say what to do about it.
 */
export function clipErrorMessage(error) {
  if (error?.status === 403) return t('clipScopeMissing');
  return error?.message || t('clipFailed');
}
