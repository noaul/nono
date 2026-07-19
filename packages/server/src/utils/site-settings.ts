import { z } from 'zod';

type AppearanceSettings = {
  cardColor: string;
  cardRadius: number;
  cardOpacity: number;
  cardBlur: number;
  searchColor: string;
  searchRadius: number;
  searchOpacity: number;
  searchBlur: number;
  bookmarkTextColor: string;
  bookmarkTextSize: number;
  notabTextColor: string;
  notabTextSize: number;
  folderTextColor: string;
  folderTextSize: number;
  categoryTextColor: string;
  tabColor: string;
  modalRadius: number;
  modalOpacity: number;
  modalBlur: number;
  tabRadius: number;
  tabOpacity: number;
  tabBlur: number;
  adminRadius: number;
  adminOpacity: number;
  adminBlur: number;
};

export const appearanceDefaults: AppearanceSettings = {
  cardColor: '#f7f8fb',
  cardRadius: 8,
  cardOpacity: 26,
  cardBlur: 18,
  searchColor: '#f7f8fb',
  searchRadius: 28,
  searchOpacity: 34,
  searchBlur: 20,
  bookmarkTextColor: '#ffffff',
  bookmarkTextSize: 14,
  notabTextColor: '#ffffff',
  notabTextSize: 15,
  folderTextColor: '#ffffff',
  folderTextSize: 18,
  categoryTextColor: '#ffffff',
  tabColor: '#f7f8fb',
  modalRadius: 8,
  modalOpacity: 85,
  modalBlur: 24,
  tabRadius: 28,
  tabOpacity: 26,
  tabBlur: 10,
  adminRadius: 8,
  adminOpacity: 72,
  adminBlur: 10,
};

type NumericAppearanceKey = Exclude<keyof AppearanceSettings, 'cardColor' | 'searchColor' | 'bookmarkTextColor' | 'notabTextColor' | 'folderTextColor' | 'categoryTextColor' | 'tabColor'>;
type ColorAppearanceKey = Exclude<keyof AppearanceSettings, NumericAppearanceKey>;

const numericAppearanceKeys: NumericAppearanceKey[] = [
  'cardRadius', 'cardOpacity', 'cardBlur',
  'searchRadius', 'searchOpacity', 'searchBlur',
  'bookmarkTextSize', 'notabTextSize', 'folderTextSize',
  'modalRadius', 'modalOpacity', 'modalBlur',
  'tabRadius', 'tabOpacity', 'tabBlur',
  'adminRadius', 'adminOpacity', 'adminBlur',
];

const colorAppearanceKeys: ColorAppearanceKey[] = ['cardColor', 'searchColor', 'bookmarkTextColor', 'notabTextColor', 'folderTextColor', 'categoryTextColor', 'tabColor'];

const appearanceLimits: Record<NumericAppearanceKey, readonly [number, number]> = {
  cardRadius: [0, 24],
  cardOpacity: [12, 90],
  cardBlur: [0, 32],
  searchRadius: [8, 40],
  searchOpacity: [12, 90],
  searchBlur: [0, 32],
  bookmarkTextSize: [12, 18],
  notabTextSize: [12, 18],
  folderTextSize: [12, 22],
  modalRadius: [0, 32],
  modalOpacity: [20, 96],
  modalBlur: [0, 40],
  tabRadius: [0, 28],
  tabOpacity: [12, 96],
  tabBlur: [0, 32],
  adminRadius: [0, 20],
  adminOpacity: [40, 100],
  adminBlur: [0, 24],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeHex(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function normalizeAppearance(input: unknown) {
  const source = isRecord(input) ? input : {};
  const result: AppearanceSettings = { ...appearanceDefaults };
  for (const key of numericAppearanceKeys) {
    const [min, max] = appearanceLimits[key];
    result[key] = normalizeNumber(source[key], appearanceDefaults[key], min, max);
  }
  for (const key of colorAppearanceKeys) {
    result[key] = normalizeHex(source[key], appearanceDefaults[key]);
  }
  result.notabTextColor = normalizeHex(source.notabTextColor, result.categoryTextColor);
  result.folderTextColor = normalizeHex(source.folderTextColor, result.categoryTextColor);
  result.categoryTextColor = result.folderTextColor;
  result.tabColor = result.searchColor;
  result.tabRadius = result.searchRadius;
  result.tabOpacity = result.searchOpacity;
  result.tabBlur = result.searchBlur;
  result.modalRadius = result.cardRadius;
  result.modalOpacity = result.cardOpacity;
  result.modalBlur = result.cardBlur;
  return result;
}

export const appearanceSchema = z.unknown().transform(normalizeAppearance);

const safeWebLocation = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}, 'URL must use http or https');

const portalSchema = z.object({
  enabled: z.boolean().default(true),
  url: safeWebLocation.default(''),
  label: z.string().trim().max(80).default('前往博客'),
  imageUrl: safeWebLocation.default(''),
  openInNewTab: z.boolean().default(false),
}).passthrough();

const navigationEntrySchema = z.object({
  id: z.string().trim().max(80).default(''),
  label: z.string().trim().min(1).max(60),
  url: safeWebLocation.refine(Boolean, 'Entry URL is required'),
  icon: z.string().trim().max(40).default('link'),
  enabled: z.boolean().default(true),
  openInNewTab: z.boolean().default(false),
});

const navigationEntriesSchema = z.array(navigationEntrySchema).max(20).transform((items) => {
  const usedIds = new Set<string>();
  return items.map((item, index) => {
    const baseId = normalizeNavigationEntryId(item.id) || `entry-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    return { ...item, id, icon: item.icon || 'link' };
  });
});

const searchTemplateSchema = z.string().trim().min(1).max(2048)
  .refine((value) => value.includes('{query}'), 'Search URL template must include {query}')
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value.replace('{query}', 'query')).protocol);
    } catch {
      return false;
    }
  }, 'Search URL template must use http or https');

const searchEngineSettingsSchema = z.object({
  defaultId: z.string().trim().max(80).default(''),
  items: z.array(z.object({
    id: z.string().trim().max(80),
    label: z.string().trim().min(1).max(60),
    short: z.string().trim().max(4).default(''),
    template: searchTemplateSchema,
    enabled: z.boolean().default(true),
  })).min(1).max(30),
}).transform((value) => {
  const usedIds = new Set<string>();
  const items = value.items.map((item, index) => {
    const baseId = normalizeSearchEngineId(item.id) || `engine-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    return {
      ...item,
      id,
      short: item.short || item.label.slice(0, 1),
    };
  });
  if (!items.some((item) => item.enabled)) items[0].enabled = true;
  const enabled = items.filter((item) => item.enabled);
  const requestedDefault = normalizeSearchEngineId(value.defaultId);
  return {
    defaultId: enabled.some((item) => item.id === requestedDefault) ? requestedDefault : enabled[0].id,
    items,
  };
});

export function normalizeSiteSettings(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) return {};
  const settings = { ...input };
  if ('appearance' in settings) settings.appearance = appearanceSchema.parse(settings.appearance);
  if ('portal' in settings) settings.portal = portalSchema.parse(settings.portal);
  if ('navigationEntries' in settings) settings.navigationEntries = navigationEntriesSchema.parse(settings.navigationEntries);
  if ('searchEngines' in settings) settings.searchEngines = searchEngineSettingsSchema.parse(settings.searchEngines);
  return settings;
}

function normalizeNavigationEntryId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function normalizeSearchEngineId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

const optionalWebLocation = safeWebLocation.nullable().optional();

export const siteUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  slug: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  backgroundImage: optionalWebLocation,
  backgroundColor: z.string().trim().max(32).optional(),
  fontColor: z.string().trim().max(32).optional(),
  searchUrlTemplate: z.string().trim().max(2048).refine((value) => value.includes('{query}'), 'Search URL template must include {query}').optional(),
  localSearchFirst: z.boolean().optional(),
  guestAccessEnabled: z.boolean().optional(),
  guestAccessPassword: z.string().min(4, 'Access password must contain at least 4 characters').max(72).optional(),
  settings: z.unknown().transform(normalizeSiteSettings).optional(),
});
