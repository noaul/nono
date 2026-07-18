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

const numericKeys: NumericAppearanceKey[] = [
  'cardRadius', 'cardOpacity', 'cardBlur',
  'searchRadius', 'searchOpacity', 'searchBlur',
  'bookmarkTextSize', 'notabTextSize', 'folderTextSize',
  'modalRadius', 'modalOpacity', 'modalBlur',
  'tabRadius', 'tabOpacity', 'tabBlur',
  'adminRadius', 'adminOpacity', 'adminBlur',
];

const colorKeys: ColorAppearanceKey[] = ['cardColor', 'searchColor', 'bookmarkTextColor', 'notabTextColor', 'folderTextColor', 'categoryTextColor', 'tabColor'];

const limits: Record<NumericAppearanceKey, readonly [number, number]> = {
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
  result.notabTextColor = normalizedHex(saved.notabTextColor, result.categoryTextColor);
  result.folderTextColor = normalizedHex(saved.folderTextColor, result.categoryTextColor);
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

export function appearanceSettingsForSave(appearance: AppearanceSettings): AppearanceSettings {
  return {
    ...appearance,
    categoryTextColor: appearance.folderTextColor,
    tabColor: appearance.searchColor,
    tabRadius: appearance.searchRadius,
    tabOpacity: appearance.searchOpacity,
    tabBlur: appearance.searchBlur,
    modalRadius: appearance.cardRadius,
    modalOpacity: appearance.cardOpacity,
    modalBlur: appearance.cardBlur,
  };
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
    '--public-bookmark-text-size': `${appearance.bookmarkTextSize}px`,
    '--public-notab-text': appearance.notabTextColor,
    '--public-notab-text-rgb': hexToRgb(appearance.notabTextColor),
    '--public-notab-text-size': `${appearance.notabTextSize}px`,
    '--public-folder-text': appearance.folderTextColor,
    '--public-folder-text-rgb': hexToRgb(appearance.folderTextColor),
    '--public-folder-text-size': `${appearance.folderTextSize}px`,
    '--public-category-text': appearance.folderTextColor,
    '--public-category-text-rgb': hexToRgb(appearance.folderTextColor),
    '--public-tab-color': appearance.searchColor,
    '--public-tab-color-rgb': hexToRgb(appearance.searchColor),
    '--public-modal-radius': `${appearance.cardRadius}px`,
    '--public-modal-opacity': (appearance.cardOpacity / 100).toFixed(2),
    '--public-modal-blur': `${appearance.cardBlur}px`,
    '--public-tab-radius': `${appearance.searchRadius}px`,
    '--public-tab-opacity': (appearance.searchOpacity / 100).toFixed(2),
    '--public-tab-blur': `${appearance.searchBlur}px`,
  };
}
