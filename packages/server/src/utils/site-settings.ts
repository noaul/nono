import { z } from 'zod';

type AppearanceValue = string | number | boolean;
type AppearanceSettings = Record<string, AppearanceValue>;

// This is the server-side validation boundary for the public catalogue in web/utils/appearance.
// The cross-workspace API test round-trips the Web defaults so a future catalogue change cannot
// silently turn into another successful-looking save that is discarded here.
const numericAppearanceFields: Record<string, readonly [number, number, number]> = {
  maxContentWidth: [2600, 960, 3200], folderColumns: [4, 1, 6], folderGapX: [20, 4, 64],
  folderGapY: [24, 4, 64], pagePaddingX: [32, 0, 96], searchMaxWidth: [760, 360, 1200],
  searchGridGap: [28, 0, 96], cardRadius: [8, 0, 24], cardOpacity: [26, 12, 90],
  cardBlur: [18, 0, 32], folderTitleGap: [10, 0, 40], folderIconSize: [18, 12, 34],
  bookmarkIconSize: [20, 12, 36], bookmarkRowHeight: [38, 26, 64], bookmarkGapX: [8, 0, 32],
  bookmarkGapY: [4, 0, 24], folderShadow: [30, 0, 100], hoverScale: [100, 100, 108],
  hoverHighlight: [40, 0, 100], searchRadius: [28, 8, 40], searchOpacity: [34, 12, 90],
  searchBlur: [20, 0, 32], searchHeight: [52, 38, 76], searchIconSize: [18, 12, 28],
  searchTextSize: [15, 12, 20], notabHeight: [38, 28, 60], notabGap: [4, 0, 24],
  notabIndicator: [2, 0, 6], glassBorderOpacity: [28, 0, 100], glassBorderWidth: [1, 0, 4],
  glassShadowStrength: [32, 0, 100], glassShadowSpread: [24, 0, 72], glassSaturation: [120, 60, 200],
  glassHighlight: [34, 0, 100], glassDarkOverlay: [42, 0, 100], backgroundBrightness: [100, 40, 140],
  backgroundBlur: [0, 0, 40], backgroundOverlay: [0, 0, 100], overlayLight: [0, 0, 100],
  overlayDark: [30, 0, 100], sceneParticleSize: [100, 50, 200], sceneSpeed: [100, 25, 200],
  sceneWind: [100, 0, 200], sceneWindDirection: [0, -100, 100], sceneDepth: [100, 0, 150],
  sceneForegroundBlur: [100, 0, 200], sceneCollision: [100, 0, 150], sceneSplash: [100, 0, 150],
  pageTitleSize: [30, 18, 52], descriptionSize: [14, 11, 22], fontWeight: [400, 300, 800],
  lineHeight: [150, 110, 210], bookmarkTextSize: [14, 12, 18], notabTextSize: [15, 12, 18],
  folderTextSize: [18, 12, 22], modalRadius: [8, 0, 32], modalOpacity: [85, 20, 96],
  modalBlur: [24, 0, 40], tabRadius: [28, 0, 28], tabOpacity: [26, 12, 96],
  tabBlur: [10, 0, 32], adminRadius: [8, 0, 20], adminOpacity: [72, 40, 100],
  adminBlur: [10, 0, 24],
};

const colorAppearanceFields: Record<string, string> = {
  cardColor: '#f7f8fb', searchColor: '#f7f8fb', pageTitleColor: '#ffffff',
  descriptionColor: '#ffffff', searchTextColor: '#ffffff', placeholderColor: '#ffffff',
  bookmarkTextColor: '#ffffff', notabTextColor: '#ffffff', folderTextColor: '#ffffff',
  categoryTextColor: '#ffffff', tabColor: '#f7f8fb',
};

const booleanAppearanceFields: Record<string, boolean> = {
  hoverAnimation: true, backgroundImageEnabled: true, sceneEnabled: true,
  sceneReducedMotion: true, sceneLowPerformance: false,
};

const enumAppearanceFields: Record<string, readonly [string, ...string[]]> = {
  density: ['balanced', 'compact', 'spacious'], notabAlign: ['center', 'left'],
  notabOverflow: ['scroll', 'wrap'], backgroundPosition: ['center', 'top', 'bottom'],
  backgroundSize: ['cover', 'contain', 'auto'], fontFamily: ['system', 'sans', 'serif', 'rounded', 'mono'],
  fontFamilyZh: ['inherit', 'heiti', 'songti', 'kaiti', 'yuanti'],
  fontFamilyEn: ['inherit', 'inter', 'georgia', 'jetbrains'],
};

export const appearanceDefaults: AppearanceSettings = applyAppearanceMirrors({
  ...Object.fromEntries(Object.entries(numericAppearanceFields).map(([key, [fallback]]) => [key, fallback])),
  ...colorAppearanceFields,
  ...booleanAppearanceFields,
  ...Object.fromEntries(Object.entries(enumAppearanceFields).map(([key, [fallback]]) => [key, fallback])),
});

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
  const result: AppearanceSettings = {};
  for (const [key, [fallback, min, max]] of Object.entries(numericAppearanceFields)) {
    result[key] = normalizeNumber(source[key], fallback, min, max);
  }
  for (const [key, fallback] of Object.entries(colorAppearanceFields)) {
    result[key] = normalizeHex(source[key], fallback);
  }
  for (const [key, fallback] of Object.entries(booleanAppearanceFields)) {
    result[key] = typeof source[key] === 'boolean' ? source[key] : fallback;
  }
  for (const [key, options] of Object.entries(enumAppearanceFields)) {
    result[key] = typeof source[key] === 'string' && options.includes(source[key]) ? source[key] : options[0];
  }
  const legacyText = normalizeHex(source.categoryTextColor, colorAppearanceFields.categoryTextColor);
  result.notabTextColor = normalizeHex(source.notabTextColor, legacyText);
  result.folderTextColor = normalizeHex(source.folderTextColor, legacyText);
  return applyAppearanceMirrors(result);
}

function applyAppearanceMirrors(result: AppearanceSettings) {
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

export const navigationEntriesSchema = z.array(navigationEntrySchema).max(20).transform((items) => {
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

/**
 * The site-wide default language. Visitors may override it in their own browser, so this is
 * only the starting point for someone who has never chosen.
 */
const i18nSettingsSchema = z.object({
  defaultLocale: z.enum(['zh', 'en']).default('zh'),
}).passthrough();

const nodeskWorkbenchSchema = z.object({
  quickEntriesVisible: z.boolean().default(true),
});

export function normalizeSiteSettings(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) return {};
  const settings = { ...input };
  if ('appearance' in settings) settings.appearance = appearanceSchema.parse(settings.appearance);
  if ('portal' in settings) settings.portal = portalSchema.parse(settings.portal);
  if ('navigationEntries' in settings) settings.navigationEntries = navigationEntriesSchema.parse(settings.navigationEntries);
  if ('searchEngines' in settings) settings.searchEngines = searchEngineSettingsSchema.parse(settings.searchEngines);
  if ('i18n' in settings) settings.i18n = i18nSettingsSchema.parse(settings.i18n);
  if ('nodeskWorkbench' in settings) settings.nodeskWorkbench = nodeskWorkbenchSchema.parse(settings.nodeskWorkbench);
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
