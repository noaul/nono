import { appearanceDefaults, type AppearanceSettings } from '@/utils/appearance';

export type PublicTheme = {
  id: string;
  name: string;
  description: string;
  backgroundColor: string;
  fontColor: string;
  accent: string;
  appearance: AppearanceSettings;
};

export const PUBLIC_THEMES: PublicTheme[] = [
  {
    id: 'midnight-glass',
    name: '暗夜玻璃',
    description: '深色底 + 翡翠光晕的默认质感',
    backgroundColor: '#090a0f',
    fontColor: '#f3f4f6',
    accent: '#10b981',
    appearance: {
      ...appearanceDefaults,
      cardColor: '#e7eef2',
      searchColor: '#eef4f7',
      bookmarkTextColor: '#ffffff',
      categoryTextColor: '#ffffff',
    },
  },
  {
    id: 'minimal-light',
    name: '极简白',
    description: '浅色清爽，低模糊高可读',
    backgroundColor: '#eef1f4',
    fontColor: '#1f2937',
    accent: '#0f766e',
    appearance: {
      ...appearanceDefaults,
      cardColor: '#ffffff',
      cardOpacity: 76,
      cardBlur: 6,
      searchColor: '#ffffff',
      searchOpacity: 82,
      searchBlur: 8,
      bookmarkTextColor: '#1f2937',
      categoryTextColor: '#1f2937',
      tabOpacity: 82,
      tabBlur: 6,
    },
  },
  {
    id: 'neon-violet',
    name: '霓虹紫蓝',
    description: '深紫夜色 + 霓虹高亮',
    backgroundColor: '#0b0716',
    fontColor: '#ede9fe',
    accent: '#8b5cf6',
    appearance: {
      ...appearanceDefaults,
      cardColor: '#c4b5fd',
      cardOpacity: 24,
      cardBlur: 20,
      searchColor: '#ddd6fe',
      searchOpacity: 34,
      searchBlur: 24,
      bookmarkTextColor: '#f5f3ff',
      categoryTextColor: '#f5f3ff',
      tabBlur: 16,
    },
  },
  {
    id: 'warm-paper',
    name: '暖纸米色',
    description: '纸质暖色调，柔和低刺激',
    backgroundColor: '#f3ecdd',
    fontColor: '#3f2f1e',
    accent: '#b45309',
    appearance: {
      ...appearanceDefaults,
      cardColor: '#fff7ed',
      cardOpacity: 72,
      cardBlur: 8,
      searchColor: '#fffbeb',
      searchOpacity: 78,
      searchBlur: 10,
      bookmarkTextColor: '#3f2f1e',
      categoryTextColor: '#3f2f1e',
      tabOpacity: 76,
      tabBlur: 6,
    },
  },
  {
    id: 'high-contrast',
    name: '高对比',
    description: '纯黑底 + 高亮强调，无障碍友好',
    backgroundColor: '#000000',
    fontColor: '#ffffff',
    accent: '#ffd60a',
    appearance: {
      ...appearanceDefaults,
      cardColor: '#000000',
      cardOpacity: 88,
      cardBlur: 0,
      searchColor: '#000000',
      searchOpacity: 90,
      searchBlur: 0,
      bookmarkTextColor: '#ffffff',
      categoryTextColor: '#ffffff',
      modalOpacity: 96,
      modalBlur: 0,
      tabOpacity: 90,
      tabBlur: 0,
    },
  },
];

export function getTheme(id: string | undefined | null) {
  return PUBLIC_THEMES.find((theme) => theme.id === id);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function lighten([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [Math.round(r + (255 - r) * amount), Math.round(g + (255 - g) * amount), Math.round(b + (255 - b) * amount)];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Derives the full accent CSS-variable family from a single accent hex. */
export function accentCssVars(accent: string | undefined | null): Record<string, string> {
  if (!accent) return {};
  const rgb = hexToRgb(accent);
  if (!rgb) return {};
  const bright = lighten(rgb, 0.14);
  const hover = lighten(rgb, 0.32);
  const soft = lighten(rgb, 0.55);
  return {
    '--accent': toHex(rgb),
    '--accent-rgb': rgb.join(', '),
    '--accent-bright': toHex(bright),
    '--accent-bright-rgb': bright.join(', '),
    '--accent-hover': toHex(hover),
    '--accent-soft': toHex(soft),
    '--accent-soft-rgb': soft.join(', '),
  };
}

/** Reads the persisted theme accent from site settings. */
export function getThemeAccentVars(settings: Record<string, unknown> | null | undefined): Record<string, string> {
  const theme = (settings as { theme?: { accent?: string } } | null | undefined)?.theme;
  return accentCssVars(theme?.accent);
}
