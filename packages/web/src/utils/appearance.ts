export interface AppearanceSettings {
  cardRadius: number;
  cardOpacity: number;
  cardBlur: number;
  searchRadius: number;
  searchOpacity: number;
  searchBlur: number;
}

export const appearanceDefaults: AppearanceSettings = {
  cardRadius: 8,
  cardOpacity: 52,
  cardBlur: 8,
  searchRadius: 28,
  searchOpacity: 26,
  searchBlur: 14,
};

const limits: Record<keyof AppearanceSettings, readonly [number, number]> = {
  cardRadius: [0, 24],
  cardOpacity: [12, 90],
  cardBlur: [0, 32],
  searchRadius: [8, 40],
  searchOpacity: [12, 90],
  searchBlur: [0, 32],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value);
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
  };
}
