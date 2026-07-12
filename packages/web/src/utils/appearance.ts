export interface AppearanceSettings {
  cardRadius: number;
  cardOpacity: number;
  cardBlur: number;
  searchRadius: number;
  searchOpacity: number;
  searchBlur: number;
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
};

const limits: Record<keyof AppearanceSettings, readonly [number, number]> = {
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

export function getAppearanceSettings(settings?: Record<string, unknown> | null): AppearanceSettings {
  const saved = isRecord(settings?.appearance) ? settings.appearance : {};
  return (Object.keys(appearanceDefaults) as Array<keyof AppearanceSettings>).reduce((result, key) => {
    const [min, max] = limits[key];
    result[key] = normalizedNumber(saved[key], appearanceDefaults[key], min, max);
    return result;
  }, { ...appearanceDefaults });
}

export function toAppearanceCssVars(appearance: AppearanceSettings): Record<string, string> {
  return {
    '--public-card-radius': `${appearance.cardRadius}px`,
    '--public-card-opacity': (appearance.cardOpacity / 100).toFixed(2),
    '--public-card-blur': `${appearance.cardBlur}px`,
    '--public-search-radius': `${appearance.searchRadius}px`,
    '--public-search-opacity': (appearance.searchOpacity / 100).toFixed(2),
    '--public-search-blur': `${appearance.searchBlur}px`,
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
