import type { SceneKind } from './sceneParticles';

/**
 * Every public-facing look-and-feel setting lives here, and every one of them is described exactly
 * once in `APPEARANCE_FIELDS`. Defaults, clamping, CSS custom properties, and the editor UI are
 * all derived from that one table, so adding a control means adding a single entry rather than
 * touching five parallel lists.
 *
 * The set is deliberately short. Spacing follows the density choice, secondary text colours follow
 * the main ones, and everything else (glass rims, icon sizes, hover effects, scene physics) uses the
 * stylesheet defaults instead of being another slider.
 */

export type DensityPreset = 'compact' | 'balanced' | 'spacious';
export type NotabAlign = 'left' | 'center';
export type FontChoice = 'system' | 'sans' | 'serif' | 'rounded' | 'mono';

export interface AppearanceSettings {
  // -- Page layout ---------------------------------------------------------------------------
  density: DensityPreset;
  maxContentWidth: number;
  folderColumns: number;
  searchMaxWidth: number;

  // -- Panels ----------------------------------------------------------------------------------
  cardColor: string;
  cardRadius: number;
  cardOpacity: number;
  cardBlur: number;

  // -- Search bar and NoTab tabs -------------------------------------------------------------
  searchColor: string;
  searchOpacity: number;
  searchHeight: number;
  notabAlign: NotabAlign;

  // -- Background ----------------------------------------------------------------------------
  backgroundImageEnabled: boolean;
  backgroundBrightness: number;
  backgroundBlur: number;
  backgroundOverlay: number;

  // -- Dynamic scenes ------------------------------------------------------------------------
  sceneEnabled: boolean;
  sceneParticleSize: number;
  sceneSpeed: number;

  // -- Typography ----------------------------------------------------------------------------
  fontFamily: FontChoice;
  pageTitleColor: string;
  bookmarkTextColor: string;
  bookmarkTextSize: number;
}

export type AppearanceKey = keyof AppearanceSettings;

/** Groups map one-to-one onto sections in the editor. */
export type AppearanceGroup =
  | 'layout'
  | 'folders'
  | 'search'
  | 'background'
  | 'scene'
  | 'typography';

export const APPEARANCE_GROUPS: AppearanceGroup[] = [
  'layout', 'folders', 'search', 'background', 'scene', 'typography',
];

/** How a numeric value becomes a CSS value. */
type NumberFormat = 'px' | 'ratio' | 'percent' | 'scale' | 'raw';

type CommonField = {
  group: AppearanceGroup;
  /** Base custom property name; omitted when the value is applied some other way. */
  cssVar?: string;
};

type NumberField = CommonField & {
  kind: 'number';
  default: number;
  min: number;
  max: number;
  step?: number;
  format?: NumberFormat;
};

type ColorField = CommonField & { kind: 'color'; default: string };
type ToggleField = CommonField & { kind: 'toggle'; default: boolean };
type EnumField<T extends string> = CommonField & { kind: 'enum'; default: T; options: readonly T[] };

export type AppearanceField =
  | NumberField
  | ColorField
  | ToggleField
  | EnumField<string>;

/**
 * Picks the descriptor shape a field must have from the type of the value it describes, so a
 * number setting cannot accidentally be given a colour descriptor.
 */
// The checks are wrapped in tuples so the conditional does not distribute: without that, an
// enum like `'left' | 'center'` would ask for `EnumField<'left'> | EnumField<'center'>` and
// reject an options array holding both.
type FieldFor<Value> =
  [Value] extends [boolean] ? ToggleField
    : [Value] extends [number] ? NumberField
      : [Value] extends [string] ? ([string] extends [Value] ? ColorField : EnumField<Value>)
        : never;

/**
 * The single source of truth. Insertion order is the order controls appear in the editor, so
 * related settings are kept adjacent here.
 */
export const APPEARANCE_FIELDS: { [K in AppearanceKey]: FieldFor<AppearanceSettings[K]> } = {
  // -- Page layout ---------------------------------------------------------------------------
  density: { kind: 'enum', group: 'layout', default: 'balanced', options: ['compact', 'balanced', 'spacious'] },
  maxContentWidth: { kind: 'number', group: 'layout', default: 2600, min: 960, max: 3200, step: 20, format: 'px', cssVar: '--public-content-max' },
  folderColumns: { kind: 'number', group: 'layout', default: 4, min: 1, max: 6, format: 'raw', cssVar: '--public-folder-columns' },
  searchMaxWidth: { kind: 'number', group: 'layout', default: 760, min: 360, max: 1200, step: 10, format: 'px', cssVar: '--public-search-max-width' },

  // -- Panels ----------------------------------------------------------------------------------
  cardColor: { kind: 'color', group: 'folders', default: '#f7f8fb', cssVar: '--public-card-color' },
  cardRadius: { kind: 'number', group: 'folders', default: 8, min: 0, max: 24, format: 'px', cssVar: '--public-card-radius' },
  cardOpacity: { kind: 'number', group: 'folders', default: 26, min: 12, max: 90, format: 'ratio', cssVar: '--public-card-opacity' },
  cardBlur: { kind: 'number', group: 'folders', default: 18, min: 0, max: 32, format: 'px', cssVar: '--public-card-blur' },

  // -- Search bar and NoTab tabs -------------------------------------------------------------
  searchColor: { kind: 'color', group: 'search', default: '#f7f8fb', cssVar: '--public-search-color' },
  searchOpacity: { kind: 'number', group: 'search', default: 34, min: 12, max: 90, format: 'ratio', cssVar: '--public-search-opacity' },
  searchHeight: { kind: 'number', group: 'search', default: 52, min: 38, max: 76, format: 'px', cssVar: '--public-search-height' },
  notabAlign: { kind: 'enum', group: 'search', default: 'center', options: ['left', 'center'] },

  // -- Background ----------------------------------------------------------------------------
  backgroundImageEnabled: { kind: 'toggle', group: 'background', default: true },
  backgroundBrightness: { kind: 'number', group: 'background', default: 100, min: 40, max: 140, format: 'percent', cssVar: '--public-bg-brightness' },
  backgroundBlur: { kind: 'number', group: 'background', default: 0, min: 0, max: 40, format: 'px', cssVar: '--public-bg-blur' },
  backgroundOverlay: { kind: 'number', group: 'background', default: 0, min: 0, max: 100, format: 'ratio', cssVar: '--public-bg-overlay' },

  // -- Dynamic scenes ------------------------------------------------------------------------
  // Static themes have no scene, so the whole group drops out of the editor for them.
  sceneEnabled: { kind: 'toggle', group: 'scene', default: true },
  sceneParticleSize: { kind: 'number', group: 'scene', default: 100, min: 50, max: 200, format: 'scale' },
  sceneSpeed: { kind: 'number', group: 'scene', default: 100, min: 25, max: 200, format: 'scale' },

  // -- Typography ----------------------------------------------------------------------------
  fontFamily: { kind: 'enum', group: 'typography', default: 'system', options: ['system', 'sans', 'serif', 'rounded', 'mono'] },
  pageTitleColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-title-text' },
  bookmarkTextColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-bookmark-text' },
  bookmarkTextSize: { kind: 'number', group: 'typography', default: 14, min: 12, max: 18, format: 'px', cssVar: '--public-bookmark-text-size' },
};

const FIELD_KEYS = Object.keys(APPEARANCE_FIELDS) as AppearanceKey[];

/** Every field, in editor order. */
export const EDITABLE_APPEARANCE_KEYS = FIELD_KEYS;

export const appearanceDefaults = Object.fromEntries(
  FIELD_KEYS.map((key) => [key, APPEARANCE_FIELDS[key].default]),
) as unknown as AppearanceSettings;

/** The spacing each density stands for; it is applied directly rather than seeding more sliders. */
export const DENSITY_SPACING: Record<DensityPreset, Record<string, string>> = {
  compact: {
    '--public-folder-gap-x': '12px',
    '--public-folder-gap-y': '14px',
    '--public-page-padding-x': '20px',
    '--public-search-grid-gap': '16px',
    '--public-bookmark-row-height': '30px',
    '--public-bookmark-gap-y': '2px',
    '--public-folder-title-gap': '6px',
    '--public-notab-height': '32px',
    '--public-line-height': '1.3',
  },
  balanced: {
    '--public-folder-gap-x': '20px',
    '--public-folder-gap-y': '24px',
    '--public-page-padding-x': '32px',
    '--public-search-grid-gap': '28px',
    '--public-bookmark-row-height': '38px',
    '--public-bookmark-gap-y': '4px',
    '--public-folder-title-gap': '10px',
    '--public-notab-height': '38px',
    '--public-line-height': '1.5',
  },
  spacious: {
    '--public-folder-gap-x': '32px',
    '--public-folder-gap-y': '36px',
    '--public-page-padding-x': '48px',
    '--public-search-grid-gap': '44px',
    '--public-bookmark-row-height': '46px',
    '--public-bookmark-gap-y': '8px',
    '--public-folder-title-gap': '16px',
    '--public-notab-height': '46px',
    '--public-line-height': '1.7',
  },
};

const FONT_STACKS: Record<FontChoice, string> = {
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "'Nunito', 'Quicksand', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
};

export function fontStack(appearance: Pick<AppearanceSettings, 'fontFamily'>): string {
  return FONT_STACKS[appearance.fontFamily] ?? FONT_STACKS.system;
}

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

/** Normalizes saved settings; keys that are no longer in the table are simply ignored. */
export function getAppearanceSettings(settings?: Record<string, unknown> | null): AppearanceSettings {
  const saved = isRecord(settings?.appearance) ? settings.appearance : {};
  const result: Record<string, unknown> = {};

  for (const key of FIELD_KEYS) {
    const field: AppearanceField = APPEARANCE_FIELDS[key];
    const raw = saved[key];
    if (field.kind === 'number') {
      result[key] = normalizedNumber(raw, field.default, field.min, field.max);
    } else if (field.kind === 'color') {
      result[key] = normalizedHex(raw, field.default);
    } else if (field.kind === 'toggle') {
      result[key] = typeof raw === 'boolean' ? raw : field.default;
    } else {
      result[key] = typeof raw === 'string' && field.options.includes(raw) ? raw : field.default;
    }
  }

  return result as unknown as AppearanceSettings;
}

function formatNumber(value: number, format: NumberFormat = 'raw') {
  switch (format) {
    case 'px': return `${value}px`;
    case 'ratio': return (value / 100).toFixed(2);
    case 'percent': return `${value}%`;
    case 'scale': return (value / 100).toFixed(3);
    default: return String(value);
  }
}

function setColor(vars: Record<string, string>, name: string, hex: string) {
  vars[name] = hex;
  vars[`${name}-rgb`] = hexToRgb(hex);
}

export function toAppearanceCssVars(appearance: AppearanceSettings): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const key of FIELD_KEYS) {
    const field: AppearanceField = APPEARANCE_FIELDS[key];
    if (!field.cssVar) continue;
    const value = appearance[key];
    if (field.kind === 'number') {
      vars[field.cssVar] = formatNumber(value as number, field.format);
    } else if (field.kind === 'color') {
      setColor(vars, field.cssVar, value as string);
    } else if (field.kind === 'toggle') {
      vars[field.cssVar] = value ? '1' : '0';
    } else {
      vars[field.cssVar] = String(value);
    }
  }

  Object.assign(vars, DENSITY_SPACING[appearance.density] ?? DENSITY_SPACING.balanced);

  // One text colour carries all the body text, and the title colour carries the description, so
  // there is no separate NoTab, folder, or placeholder colour left to fall out of step.
  for (const name of ['--public-notab-text', '--public-folder-text', '--public-search-text', '--public-placeholder-text']) {
    setColor(vars, name, appearance.bookmarkTextColor);
  }
  setColor(vars, '--public-description-text', appearance.pageTitleColor);
  // The search bar and NoTab strip share the panels' frosting rather than a blur of their own.
  vars['--public-search-blur'] = `${appearance.cardBlur}px`;

  vars['--public-font-family'] = fontStack(appearance);
  // Plain `center` lets the flex line overflow equally on both sides; since a scrollable LTR
  // container can never reach a negative scrollLeft, the start-side overflow (the first tab)
  // becomes permanently unreachable once the strip is wider than the viewport. `safe center`
  // falls back to start alignment exactly when that overflow would occur, so scrollLeft 0 always
  // shows the first tab in full while still centering short, non-overflowing tab strips.
  vars['--public-notab-justify'] = appearance.notabAlign === 'left' ? 'flex-start' : 'safe center';
  // A centred strip hugs its tabs; a left-aligned one keeps the full row so "left" still means
  // something.
  vars['--public-notab-strip-width'] = appearance.notabAlign === 'left' ? 'min(100%, 1200px)' : 'fit-content';

  return vars;
}

/** Scene knobs the renderer needs, already converted out of percentages. */
export type SceneTuning = {
  enabled: boolean;
  particleSize: number;
  speed: number;
  wind: number;
  windDirection: number;
  depth: number;
  foregroundBlur: number;
  collision: number;
  splash: number;
  followReducedMotion: boolean;
  lowPerformance: boolean;
};

/** Only size and speed are settings; the physics keep each scene's tuned values. */
export function toSceneTuning(appearance: AppearanceSettings): SceneTuning {
  return {
    enabled: appearance.sceneEnabled,
    particleSize: appearance.sceneParticleSize / 100,
    speed: appearance.sceneSpeed / 100,
    wind: 1,
    windDirection: 0,
    depth: 1,
    foregroundBlur: 1,
    collision: 1,
    splash: 1,
    followReducedMotion: true,
    lowPerformance: false,
  };
}

/** Scene controls only mean something when the theme has a scene; everything else always applies. */
export function fieldAppliesToScene(key: AppearanceKey, kind: SceneKind | undefined): boolean {
  return APPEARANCE_FIELDS[key].group !== 'scene' || Boolean(kind);
}

/** Keys whose value differs from the shipped default, used for the "changed" markers. */
export function changedAppearanceKeys(appearance: AppearanceSettings): AppearanceKey[] {
  return EDITABLE_APPEARANCE_KEYS.filter((key) => appearance[key] !== appearanceDefaults[key]);
}
