import { z } from 'zod';

export const appearanceDefaults = {
  cardRadius: 8,
  cardOpacity: 52,
  cardBlur: 8,
  searchRadius: 28,
  searchOpacity: 26,
  searchBlur: 14,
  modalRadius: 8,
  modalOpacity: 85,
  modalBlur: 24,
  tabRadius: 28,
  tabOpacity: 12,
  tabBlur: 10,
  adminRadius: 8,
  adminOpacity: 72,
  adminBlur: 10,
} as const;

type AppearanceKey = keyof typeof appearanceDefaults;

const appearanceLimits: Record<AppearanceKey, readonly [number, number]> = {
  cardRadius: [0, 24],
  cardOpacity: [12, 90],
  cardBlur: [0, 32],
  searchRadius: [8, 40],
  searchOpacity: [12, 90],
  searchBlur: [0, 32],
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

function normalizeAppearance(input: unknown) {
  const source = isRecord(input) ? input : {};
  return (Object.keys(appearanceDefaults) as AppearanceKey[]).reduce<Record<AppearanceKey, number>>((result, key) => {
    const [min, max] = appearanceLimits[key];
    result[key] = normalizeNumber(source[key], appearanceDefaults[key], min, max);
    return result;
  }, { ...appearanceDefaults });
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
  if ('searchEngines' in settings) settings.searchEngines = searchEngineSettingsSchema.parse(settings.searchEngines);
  return settings;
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
  settings: z.unknown().transform(normalizeSiteSettings).optional(),
});
