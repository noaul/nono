const MAX_BOOKMARK_NAME_WIDTH = 8;

const KNOWN_SITE_NAMES: Record<string, string> = {
  'bilibili.com': '哔哩哔哩',
  'chatgpt.com': 'ChatGPT',
  'developer.mozilla.org': 'MDN',
  'feishu.cn': '飞书',
  'figma.com': 'Figma',
  'github.com': 'GitHub',
  'google.com': 'Google',
  'juejin.cn': '掘金',
  'notion.so': 'Notion',
  'openai.com': 'OpenAI',
  'twitter.com': 'X',
  'x.com': 'X',
  'youtube.com': 'YouTube',
  'zhihu.com': '知乎',
};

export function shortenBookmarkName(value: unknown, rawUrl: string) {
  const siteName = siteNameFromUrl(rawUrl);
  let name = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name || isGenericName(name)) return siteName;

  name = name.split(/[|｜]/, 1)[0].trim();
  const segments = name.split(/\s+(?:—|–|-)\s+/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > 1) {
    name = segments[0];
  }

  name = name.replace(/\s*[-|｜—–]\s*$/, '').trim();
  if (!name || isGenericName(name)) return siteName;
  return truncateToVisualWidth(name, MAX_BOOKMARK_NAME_WIDTH);
}

function siteNameFromUrl(rawUrl: string) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    const known = Object.entries(KNOWN_SITE_NAMES).find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (known) return known[1];
    const parts = hostname.split('.');
    return parts.length > 1 ? parts.at(-2) || hostname : hostname;
  } catch {
    return '未命名书签';
  }
}

function isGenericName(value: string) {
  return /^(home|homepage|index|welcome|untitled|首页|主页|欢迎页)$/i.test(value.trim());
}

function truncateToVisualWidth(value: string, maxWidth: number) {
  let width = 0;
  let result = '';
  let truncated = false;

  for (const character of value) {
    const characterWidth = visualWidthOf(character);
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
  if (/[A-Za-z0-9]/.test(result) && isWideCharacter([...result].at(-1) || '')) return [...result].slice(0, -1).join('').trimEnd();
  return result.trimEnd();
}

function visualWidthOf(character: string) {
  if (/\s/.test(character)) return 0.25;
  if (isWideCharacter(character)) return 1;
  if (/[A-Za-z0-9]/.test(character)) return 0.55;
  return 0.45;
}

function isWideCharacter(character: string) {
  return /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/u.test(character);
}
