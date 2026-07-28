import type { MessageKey } from '@/locales';
import { appearanceDefaults, type AppearanceSettings } from '@/utils/appearance';

export type ThemeTone = 'light' | 'dark';
export type ThemeSceneKind = 'bubbles' | 'snow' | 'leaves' | 'stars' | 'sunbeams' | 'rain';
export type ThemeSceneMode = 'texture' | 'particles';
export type ThemeSceneMotion = 'float' | 'fall' | 'drift' | 'shimmer' | 'breathe' | 'rain';

export type ThemeScene = {
  kind: ThemeSceneKind;
  /** Catalogue key, e.g. 'themes.summerBreeze.scene'; resolved at render time. */
  labelKey: MessageKey;
  asset: string;
  mode: ThemeSceneMode;
  motion: ThemeSceneMotion;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'soft-light' | 'overlay';
};

export type ThemeSurface = {
  border: string;
  highlight: string;
  hover: string;
  shadow: string;
  overlay: string;
  accentInk: string;
};

export type PublicTheme = {
  id: string;
  /** Catalogue keys, so a theme reads in whichever language the viewer picked. */
  nameKey: MessageKey;
  descriptionKey: MessageKey;
  tone: ThemeTone;
  backgroundColor: string;
  fontColor: string;
  accent: string;
  surface: ThemeSurface;
  scene: ThemeScene;
  appearance: AppearanceSettings;
};

export const PUBLIC_THEMES: PublicTheme[] = [
  {
    id: 'summer-breeze',
    nameKey: 'themes.summerBreeze.name',
    descriptionKey: 'themes.summerBreeze.description',
    tone: 'light',
    backgroundColor: '#cbe9e4',
    fontColor: '#16343a',
    accent: '#0b7d80',
    surface: {
      border: '#ffffff',
      highlight: '#ffffff',
      hover: '#ccefeb',
      shadow: '#527d82',
      overlay: '#153e46',
      accentInk: '#f4fffe',
    },
    scene: {
      kind: 'bubbles',
      labelKey: 'themes.summerBreeze.scene',
      asset: '/theme-scenes/summer-bubbles.jpg',
      mode: 'texture',
      motion: 'float',
      opacity: 0.32,
      blendMode: 'soft-light',
    },
    appearance: {
      ...appearanceDefaults,
      cardColor: '#f4fffe',
      cardRadius: 12,
      cardOpacity: 58,
      cardBlur: 18,
      searchColor: '#f6fffd',
      searchRadius: 28,
      searchOpacity: 70,
      searchBlur: 20,
      bookmarkTextColor: '#17383d',
      notabTextColor: '#16454b',
      folderTextColor: '#0f3d42',
      categoryTextColor: '#0f3d42',
      tabColor: '#f6fffd',
      tabOpacity: 70,
      tabBlur: 20,
      modalOpacity: 58,
      modalBlur: 18,
    },
  },
  {
    id: 'winter-glow',
    nameKey: 'themes.winterGlow.name',
    descriptionKey: 'themes.winterGlow.description',
    tone: 'light',
    backgroundColor: '#cfdcee',
    fontColor: '#3a3029',
    accent: '#c8622f',
    surface: {
      border: '#ffffff',
      highlight: '#fff8e9',
      hover: '#f7e5d8',
      shadow: '#66788c',
      overlay: '#29394a',
      accentInk: '#fffaf3',
    },
    scene: {
      kind: 'snow',
      labelKey: 'themes.winterGlow.scene',
      asset: '/theme-scenes/winter-snowflake.png',
      mode: 'particles',
      motion: 'fall',
      opacity: 0.44,
      blendMode: 'screen',
    },
    appearance: {
      ...appearanceDefaults,
      cardColor: '#fffaf3',
      cardRadius: 12,
      cardOpacity: 74,
      cardBlur: 18,
      searchColor: '#fffdf8',
      searchRadius: 28,
      searchOpacity: 80,
      searchBlur: 18,
      bookmarkTextColor: '#3f352f',
      notabTextColor: '#4a3f38',
      folderTextColor: '#493a32',
      categoryTextColor: '#493a32',
      tabColor: '#fffdf8',
      tabOpacity: 80,
      tabBlur: 18,
      modalOpacity: 74,
      modalBlur: 18,
    },
  },
  {
    id: 'verdant-leaves',
    nameKey: 'themes.verdantLeaves.name',
    descriptionKey: 'themes.verdantLeaves.description',
    tone: 'light',
    backgroundColor: '#d7e6d8',
    fontColor: '#173b2a',
    accent: '#2f855a',
    surface: {
      border: '#f8fff9',
      highlight: '#ffffff',
      hover: '#d5ead9',
      shadow: '#405f4b',
      overlay: '#142f22',
      accentInk: '#f7fff9',
    },
    scene: {
      kind: 'leaves',
      labelKey: 'themes.verdantLeaves.scene',
      asset: '/theme-scenes/verdant-leaves.jpg',
      mode: 'texture',
      motion: 'float',
      opacity: 0.3,
      blendMode: 'soft-light',
    },
    appearance: {
      ...appearanceDefaults,
      cardColor: '#f4faf4',
      cardRadius: 12,
      cardOpacity: 64,
      cardBlur: 20,
      searchColor: '#f7fcf7',
      searchRadius: 28,
      searchOpacity: 72,
      searchBlur: 22,
      bookmarkTextColor: '#1f4030',
      notabTextColor: '#244e36',
      folderTextColor: '#173b2a',
      categoryTextColor: '#173b2a',
      tabColor: '#f7fcf7',
      tabOpacity: 72,
      tabBlur: 22,
      modalOpacity: 64,
      modalBlur: 20,
    },
  },
  {
    id: 'starlit-night',
    nameKey: 'themes.starlitNight.name',
    descriptionKey: 'themes.starlitNight.description',
    tone: 'dark',
    backgroundColor: '#101622',
    fontColor: '#f3f4ef',
    accent: '#f0b86e',
    surface: {
      border: '#d8c8ff',
      highlight: '#ffffff',
      hover: '#6d5f87',
      shadow: '#04070d',
      overlay: '#050713',
      accentInk: '#24180d',
    },
    scene: {
      kind: 'stars',
      labelKey: 'themes.starlitNight.scene',
      asset: '/theme-scenes/starlit-sky.jpg',
      mode: 'texture',
      motion: 'shimmer',
      opacity: 0.4,
      blendMode: 'screen',
    },
    appearance: {
      ...appearanceDefaults,
      cardColor: '#d6d1ea',
      cardRadius: 12,
      cardOpacity: 20,
      cardBlur: 22,
      searchColor: '#d9e6ef',
      searchRadius: 28,
      searchOpacity: 24,
      searchBlur: 24,
      bookmarkTextColor: '#f6f4ee',
      notabTextColor: '#f8dcae',
      folderTextColor: '#d8e8f2',
      categoryTextColor: '#d8e8f2',
      tabColor: '#d9e6ef',
      tabOpacity: 24,
      tabBlur: 24,
      modalOpacity: 20,
      modalBlur: 22,
    },
  },
  {
    id: 'clear-day',
    nameKey: 'themes.clearDay.name',
    descriptionKey: 'themes.clearDay.description',
    tone: 'light',
    backgroundColor: '#dceaef',
    fontColor: '#203238',
    accent: '#c26a17',
    surface: {
      border: '#ffffff',
      highlight: '#fffbe6',
      hover: '#e5efd7',
      shadow: '#687f78',
      overlay: '#273b39',
      accentInk: '#fffdf5',
    },
    scene: {
      kind: 'sunbeams',
      labelKey: 'themes.clearDay.scene',
      asset: '/theme-scenes/clear-sunbeams.jpg',
      mode: 'texture',
      motion: 'breathe',
      opacity: 0.34,
      blendMode: 'soft-light',
    },
    appearance: {
      ...appearanceDefaults,
      cardColor: '#fbfff7',
      cardRadius: 12,
      cardOpacity: 72,
      cardBlur: 16,
      searchColor: '#fffef6',
      searchRadius: 28,
      searchOpacity: 80,
      searchBlur: 18,
      bookmarkTextColor: '#26383c',
      notabTextColor: '#2e4c50',
      folderTextColor: '#23433f',
      categoryTextColor: '#23433f',
      tabColor: '#fffef6',
      tabOpacity: 80,
      tabBlur: 18,
      modalOpacity: 72,
      modalBlur: 16,
    },
  },
  {
    id: 'rainy-world',
    nameKey: 'themes.rainyWorld.name',
    descriptionKey: 'themes.rainyWorld.description',
    tone: 'light',
    backgroundColor: '#c7d4d2',
    fontColor: '#172d31',
    accent: '#367c87',
    surface: {
      border: '#f4fffd',
      highlight: '#ffffff',
      hover: '#d4e6e4',
      shadow: '#394e52',
      overlay: '#17282c',
      accentInk: '#f4ffff',
    },
    scene: {
      kind: 'rain',
      labelKey: 'themes.rainyWorld.scene',
      asset: '/theme-scenes/rain-window.jpg',
      mode: 'texture',
      motion: 'rain',
      opacity: 0.32,
      blendMode: 'soft-light',
    },
    appearance: {
      ...appearanceDefaults,
      cardColor: '#e8f1ef',
      cardRadius: 12,
      cardOpacity: 52,
      cardBlur: 22,
      searchColor: '#eef5f4',
      searchRadius: 28,
      searchOpacity: 60,
      searchBlur: 24,
      bookmarkTextColor: '#1f3438',
      notabTextColor: '#234c52',
      folderTextColor: '#173b40',
      categoryTextColor: '#173b40',
      tabColor: '#eef5f4',
      tabOpacity: 60,
      tabBlur: 24,
      modalOpacity: 52,
      modalBlur: 22,
    },
  },
];

const LEGACY_THEME_ALIASES: Record<string, string> = {
  'midnight-glass': 'starlit-night',
  'minimal-light': 'clear-day',
  'neon-violet': 'starlit-night',
  'warm-paper': 'winter-glow',
  'high-contrast': 'starlit-night',
};

export function getTheme(id: string | undefined | null) {
  if (!id) return undefined;
  const resolvedId = LEGACY_THEME_ALIASES[id] || id;
  return PUBLIC_THEMES.find((theme) => theme.id === resolvedId);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbString(color: string) {
  return hexToRgb(color)?.join(', ') || '';
}

function lighten([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [Math.round(r + (255 - r) * amount), Math.round(g + (255 - g) * amount), Math.round(b + (255 - b) * amount)];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function pageTextCssVars(color: string | undefined | null): Record<string, string> {
  if (!color) return {};
  const rgb = rgbString(color);
  if (!rgb) return {};
  return {
    '--public-page-text': color,
    '--public-page-text-rgb': rgb,
  };
}

export function themeCssVars(theme: PublicTheme): Record<string, string> {
  return {
    ...accentCssVars(theme.accent),
    ...pageTextCssVars(theme.fontColor),
    '--public-border-rgb': rgbString(theme.surface.border),
    '--public-highlight-rgb': rgbString(theme.surface.highlight),
    '--public-hover-rgb': rgbString(theme.surface.hover),
    '--public-shadow-rgb': rgbString(theme.surface.shadow),
    '--public-overlay-rgb': rgbString(theme.surface.overlay),
    '--public-accent-ink': theme.surface.accentInk,
    '--public-scene-opacity': String(theme.scene.opacity),
  };
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

/**
 * Reads the persisted scene intensity dial (0-100) from site settings.
 * 100 keeps each theme's tuned look; 0 turns the ambient scene off entirely.
 */
export function getSceneIntensity(settings: Record<string, unknown> | null | undefined): number {
  const theme = (settings as { theme?: { sceneIntensity?: unknown } } | null | undefined)?.theme;
  const value = theme?.sceneIntensity;
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(number)) return 100;
  return Math.min(100, Math.max(0, Math.round(number)));
}
