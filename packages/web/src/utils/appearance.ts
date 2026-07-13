export interface AppearanceSettings {
  cardColor: string;
  cardRadius: number;
  cardOpacity: number;
  cardBlur: number;
  searchColor: string;
  searchRadius: number;
  searchOpacity: number;
  searchBlur: number;
  bookmarkTextColor: string;
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
}

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

type NumericAppearanceKey = Exclude<keyof AppearanceSettings, 'cardColor' | 'searchColor' | 'bookmarkTextColor' | 'categoryTextColor' | 'tabColor'>;
type ColorAppearanceKey = Exclude<keyof AppearanceSettings, NumericAppearanceKey>;

const numericKeys: NumericAppearanceKey[] = [
  'cardRadius', 'cardOpacity', 'cardBlur',
  'searchRadius', 'searchOpacity', 'searchBlur',
  'modalRadius', 'modalOpacity', 'modalBlur',
  'tabRadius', 'tabOpacity', 'tabBlur',
  'adminRadius', 'adminOpacity', 'adminBlur',
];

const colorKeys: ColorAppearanceKey[] = ['cardColor', 'searchColor', 'bookmarkTextColor', 'categoryTextColor', 'tabColor'];

const limits: Record<NumericAppearanceKey, readonly [number, number]> = {
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

function normalizedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizedHex(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

export function getAppearanceSettings(settings?: Record<string, unknown> | null): AppearanceSettings {
  const saved = isRecord(settings?.appearance) ? settings.appearance : {};
  const result = { ...appearanceDefaults };
  for (const key of numericKeys) {
    const [min, max] = limits[key];
    result[key] = normalizedNumber(saved[key], appearanceDefaults[key], min, max);
  }
  for (const key of colorKeys) {
    result[key] = normalizedHex(saved[key], appearanceDefaults[key]);
  }
  return result;
}

export function toAppearanceCssVars(appearance: AppearanceSettings): Record<string, string> {
  return {
    '--public-card-color': appearance.cardColor,
    '--public-card-color-rgb': hexToRgb(appearance.cardColor),
    '--public-card-radius': `${appearance.cardRadius}px`,
    '--public-card-opacity': (appearance.cardOpacity / 100).toFixed(2),
    '--public-card-blur': `${appearance.cardBlur}px`,
    '--public-search-color': appearance.searchColor,
    '--public-search-color-rgb': hexToRgb(appearance.searchColor),
    '--public-search-radius': `${appearance.searchRadius}px`,
    '--public-search-opacity': (appearance.searchOpacity / 100).toFixed(2),
    '--public-search-blur': `${appearance.searchBlur}px`,
    '--public-bookmark-text': appearance.bookmarkTextColor,
    '--public-bookmark-text-rgb': hexToRgb(appearance.bookmarkTextColor),
    '--public-category-text': appearance.categoryTextColor,
    '--public-category-text-rgb': hexToRgb(appearance.categoryTextColor),
    '--public-tab-color': appearance.tabColor,
    '--public-tab-color-rgb': hexToRgb(appearance.tabColor),
    '--public-modal-radius': `${appearance.modalRadius}px`,
    '--public-modal-opacity': (appearance.modalOpacity / 100).toFixed(2),
    '--public-modal-blur': `${appearance.modalBlur}px`,
    '--public-tab-radius': `${appearance.tabRadius}px`,
    '--public-tab-opacity': (appearance.tabOpacity / 100).toFixed(2),
    '--public-tab-blur': `${appearance.tabBlur}px`,
    '--admin-surface-radius': `${appearance.adminRadius}px`,
    '--admin-surface-opacity': (appearance.adminOpacity / 100).toFixed(2),
    '--admin-surface-blur': `${appearance.adminBlur}px`,
  };
}
