import type { NavigationEntry } from '@/api/types';

export const defaultNavigationEntries: NavigationEntry[] = [
  {
    id: 'nomoney',
    label: 'NoMoney',
    url: '/nomoney',
    icon: 'wallet-cards',
    enabled: true,
    openInNewTab: true,
  },
  {
    id: 'nostar',
    label: 'NoStar',
    url: '/nostar',
    icon: 'star',
    enabled: true,
    openInNewTab: true,
  },
];

export const navigationEntriesVersion = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeLocation(value: unknown) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeId(value: unknown, index: number) {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    : '';
  return normalized || `entry-${index + 1}`;
}

export function getNavigationEntries(settings: unknown): NavigationEntry[] {
  const saved = isRecord(settings) && Array.isArray(settings.navigationEntries)
    ? settings.navigationEntries
    : null;
  const savedVersion = isRecord(settings) ? Number(settings.navigationEntriesVersion || 0) : 0;
  const savedIds = new Set((saved || []).map((value, index) => isRecord(value) ? normalizeId(value.id, index) : ''));
  const source = saved
    ? savedVersion >= navigationEntriesVersion
      ? saved
      : [...saved, ...defaultNavigationEntries.filter((entry) => !savedIds.has(entry.id))]
    : defaultNavigationEntries;
  const used = new Set<string>();
  return source.flatMap((value, index) => {
    if (!isRecord(value)) return [];
    const label = typeof value.label === 'string' ? value.label.trim().slice(0, 60) : '';
    const url = safeLocation(value.url);
    if (!label || !url) return [];
    const baseId = normalizeId(value.id, index);
    let id = baseId;
    let suffix = 2;
    while (used.has(id)) id = `${baseId}-${suffix++}`;
    used.add(id);
    return [{
      id,
      label,
      url,
      icon: typeof value.icon === 'string' ? value.icon.trim().slice(0, 40) : 'link',
      enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
      openInNewTab: id === 'nomoney' || id === 'nostar'
        ? true
        : typeof value.openInNewTab === 'boolean' ? value.openInNewTab : false,
    }];
  });
}
