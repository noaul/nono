import type { SceneKind } from './sceneParticles';

/**
 * Every public-facing look-and-feel value lives here, and every one of them is described exactly
 * once in `APPEARANCE_FIELDS`. Defaults, clamping, CSS custom properties, and the editor UI are
 * all derived from that one table, so adding a control means adding a single entry rather than
 * touching five parallel lists.
 */

export type DensityPreset = 'compact' | 'balanced' | 'spacious';
export type NotabAlign = 'left' | 'center';
export type NotabOverflow = 'scroll' | 'wrap';
export type BackgroundPosition = 'center' | 'top' | 'bottom';
export type BackgroundSize = 'cover' | 'contain' | 'auto';
export type FontChoice = 'system' | 'sans' | 'serif' | 'rounded' | 'mono';
export type FontChoiceZh = 'inherit' | 'heiti' | 'songti' | 'kaiti' | 'yuanti';
export type FontChoiceEn = 'inherit' | 'inter' | 'georgia' | 'jetbrains';

export interface AppearanceSettings {
  // -- Page layout ---------------------------------------------------------------------------
  density: DensityPreset;
  maxContentWidth: number;
  folderColumns: number;
  folderGapX: number;
  folderGapY: number;
  pagePaddingX: number;
  searchMaxWidth: number;
  searchGridGap: number;

  // -- Folders and bookmarks ----------------------------------------------------------------
  cardColor: string;
  cardRadius: number;
  cardOpacity: number;
  cardBlur: number;
  folderTitleGap: number;
  folderIconSize: number;
  bookmarkIconSize: number;
  bookmarkRowHeight: number;
  bookmarkGapX: number;
  bookmarkGapY: number;
  folderShadow: number;
  hoverScale: number;
  hoverHighlight: number;
  hoverAnimation: boolean;

  // -- Search bar and Notab tabs -------------------------------------------------------------
  searchColor: string;
  searchRadius: number;
  searchOpacity: number;
  searchBlur: number;
  searchHeight: number;
  searchIconSize: number;
  searchTextSize: number;
  notabHeight: number;
  notabGap: number;
  notabIndicator: number;
  notabAlign: NotabAlign;
  notabOverflow: NotabOverflow;

  // -- Glass ---------------------------------------------------------------------------------
  glassBorderOpacity: number;
  glassBorderWidth: number;
  glassShadowStrength: number;
  glassShadowSpread: number;
  glassSaturation: number;
  glassHighlight: number;
  glassDarkOverlay: number;

  // -- Background ----------------------------------------------------------------------------
  backgroundImageEnabled: boolean;
  backgroundBrightness: number;
  backgroundBlur: number;
  backgroundOverlay: number;
  backgroundPosition: BackgroundPosition;
  backgroundSize: BackgroundSize;
  overlayLight: number;
  overlayDark: number;

  // -- Dynamic scenes ------------------------------------------------------------------------
  sceneEnabled: boolean;
  sceneParticleSize: number;
  sceneSpeed: number;
  sceneWind: number;
  sceneWindDirection: number;
  sceneDepth: number;
  sceneForegroundBlur: number;
  sceneCollision: number;
  sceneSplash: number;
  sceneReducedMotion: boolean;
  sceneLowPerformance: boolean;

  // -- Typography ----------------------------------------------------------------------------
  pageTitleColor: string;
  pageTitleSize: number;
  descriptionColor: string;
  descriptionSize: number;
  searchTextColor: string;
  placeholderColor: string;
  fontWeight: number;
  fontFamily: FontChoice;
  fontFamilyZh: FontChoiceZh;
  fontFamilyEn: FontChoiceEn;
  lineHeight: number;
  bookmarkTextColor: string;
  bookmarkTextSize: number;
  notabTextColor: string;
  notabTextSize: number;
  folderTextColor: string;
  folderTextSize: number;

  // -- Mirrored for older payloads. Not editable; kept so saved sites keep working. ----------
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

export type AppearanceKey = keyof AppearanceSettings;

/** Groups map one-to-one onto sections in the editor. */
export type AppearanceGroup =
  | 'layout'
  | 'folders'
  | 'search'
  | 'glass'
  | 'background'
  | 'scene'
  | 'typography';

export const APPEARANCE_GROUPS: AppearanceGroup[] = [
  'layout', 'folders', 'search', 'glass', 'background', 'scene', 'typography',
];

/** How a numeric value becomes a CSS value. */
type NumberFormat = 'px' | 'ratio' | 'percent' | 'scale' | 'raw';

type CommonField = {
  group: AppearanceGroup;
  /** Advanced controls sit inside a collapsible section instead of the always-open block. */
  advanced?: boolean;
  /** Only offered when the active theme uses one of these scenes. */
  scenes?: SceneKind[];
  /** Mirrored legacy value: normalized and saved, but never shown in the editor. */
  legacy?: boolean;
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
  folderGapX: { kind: 'number', group: 'layout', default: 20, min: 4, max: 64, format: 'px', cssVar: '--public-folder-gap-x' },
  folderGapY: { kind: 'number', group: 'layout', default: 24, min: 4, max: 64, format: 'px', cssVar: '--public-folder-gap-y' },
  pagePaddingX: { kind: 'number', group: 'layout', default: 32, min: 0, max: 96, format: 'px', cssVar: '--public-page-padding-x' },
  searchMaxWidth: { kind: 'number', group: 'layout', default: 760, min: 360, max: 1200, step: 10, format: 'px', cssVar: '--public-search-max-width' },
  searchGridGap: { kind: 'number', group: 'layout', default: 28, min: 0, max: 96, format: 'px', cssVar: '--public-search-grid-gap' },

  // -- Folders and bookmarks ----------------------------------------------------------------
  cardColor: { kind: 'color', group: 'folders', default: '#f7f8fb', cssVar: '--public-card-color' },
  cardRadius: { kind: 'number', group: 'folders', default: 8, min: 0, max: 24, format: 'px', cssVar: '--public-card-radius' },
  cardOpacity: { kind: 'number', group: 'folders', default: 26, min: 12, max: 90, format: 'ratio', cssVar: '--public-card-opacity' },
  cardBlur: { kind: 'number', group: 'folders', default: 18, min: 0, max: 32, format: 'px', cssVar: '--public-card-blur' },
  folderTitleGap: { kind: 'number', group: 'folders', default: 10, min: 0, max: 40, format: 'px', cssVar: '--public-folder-title-gap' },
  folderIconSize: { kind: 'number', group: 'folders', default: 18, min: 12, max: 34, format: 'px', cssVar: '--public-folder-icon-size' },
  bookmarkIconSize: { kind: 'number', group: 'folders', default: 20, min: 12, max: 36, format: 'px', cssVar: '--public-bookmark-icon-size' },
  bookmarkRowHeight: { kind: 'number', group: 'folders', default: 38, min: 26, max: 64, format: 'px', cssVar: '--public-bookmark-row-height' },
  bookmarkGapX: { kind: 'number', group: 'folders', default: 8, min: 0, max: 32, format: 'px', cssVar: '--public-bookmark-gap-x' },
  bookmarkGapY: { kind: 'number', group: 'folders', default: 4, min: 0, max: 24, format: 'px', cssVar: '--public-bookmark-gap-y' },
  folderShadow: { kind: 'number', group: 'folders', default: 30, min: 0, max: 100, advanced: true, format: 'ratio', cssVar: '--public-folder-shadow' },
  hoverScale: { kind: 'number', group: 'folders', default: 100, min: 100, max: 108, advanced: true, format: 'scale' },
  hoverHighlight: { kind: 'number', group: 'folders', default: 40, min: 0, max: 100, advanced: true, format: 'ratio', cssVar: '--public-hover-highlight' },
  hoverAnimation: { kind: 'toggle', group: 'folders', default: true, advanced: true, cssVar: '--public-hover-animation' },

  // -- Search bar and Notab tabs -------------------------------------------------------------
  searchColor: { kind: 'color', group: 'search', default: '#f7f8fb', cssVar: '--public-search-color' },
  searchRadius: { kind: 'number', group: 'search', default: 28, min: 8, max: 40, format: 'px', cssVar: '--public-search-radius' },
  searchOpacity: { kind: 'number', group: 'search', default: 34, min: 12, max: 90, format: 'ratio', cssVar: '--public-search-opacity' },
  searchBlur: { kind: 'number', group: 'search', default: 20, min: 0, max: 32, format: 'px', cssVar: '--public-search-blur' },
  searchHeight: { kind: 'number', group: 'search', default: 52, min: 38, max: 76, format: 'px', cssVar: '--public-search-height' },
  searchIconSize: { kind: 'number', group: 'search', default: 18, min: 12, max: 28, format: 'px', cssVar: '--public-search-icon-size' },
  searchTextSize: { kind: 'number', group: 'search', default: 15, min: 12, max: 20, format: 'px', cssVar: '--public-search-text-size' },
  notabHeight: { kind: 'number', group: 'search', default: 38, min: 28, max: 60, format: 'px', cssVar: '--public-notab-height' },
  notabGap: { kind: 'number', group: 'search', default: 4, min: 0, max: 24, format: 'px', cssVar: '--public-notab-gap' },
  notabIndicator: { kind: 'number', group: 'search', default: 2, min: 0, max: 6, advanced: true, format: 'px', cssVar: '--public-notab-indicator' },
  notabAlign: { kind: 'enum', group: 'search', default: 'center', options: ['left', 'center'], advanced: true },
  notabOverflow: { kind: 'enum', group: 'search', default: 'scroll', options: ['scroll', 'wrap'], advanced: true },

  // -- Glass ---------------------------------------------------------------------------------
  glassBorderOpacity: { kind: 'number', group: 'glass', default: 28, min: 0, max: 100, format: 'ratio', cssVar: '--public-glass-border-opacity' },
  glassBorderWidth: { kind: 'number', group: 'glass', default: 1, min: 0, max: 4, format: 'px', cssVar: '--public-glass-border-width' },
  glassShadowStrength: { kind: 'number', group: 'glass', default: 32, min: 0, max: 100, format: 'ratio', cssVar: '--public-glass-shadow-strength' },
  glassShadowSpread: { kind: 'number', group: 'glass', default: 24, min: 0, max: 72, format: 'px', cssVar: '--public-glass-shadow-spread' },
  glassSaturation: { kind: 'number', group: 'glass', default: 120, min: 60, max: 200, advanced: true, format: 'percent', cssVar: '--public-glass-saturation' },
  glassHighlight: { kind: 'number', group: 'glass', default: 34, min: 0, max: 100, advanced: true, format: 'ratio', cssVar: '--public-glass-highlight' },
  glassDarkOverlay: { kind: 'number', group: 'glass', default: 42, min: 0, max: 100, advanced: true, format: 'ratio', cssVar: '--public-glass-dark-overlay' },

  // -- Background ----------------------------------------------------------------------------
  backgroundImageEnabled: { kind: 'toggle', group: 'background', default: true },
  backgroundBrightness: { kind: 'number', group: 'background', default: 100, min: 40, max: 140, format: 'percent', cssVar: '--public-bg-brightness' },
  backgroundBlur: { kind: 'number', group: 'background', default: 0, min: 0, max: 40, format: 'px', cssVar: '--public-bg-blur' },
  backgroundOverlay: { kind: 'number', group: 'background', default: 0, min: 0, max: 100, format: 'ratio', cssVar: '--public-bg-overlay' },
  backgroundPosition: { kind: 'enum', group: 'background', default: 'center', options: ['center', 'top', 'bottom'] },
  backgroundSize: { kind: 'enum', group: 'background', default: 'cover', options: ['cover', 'contain', 'auto'], cssVar: '--public-bg-size' },
  overlayLight: { kind: 'number', group: 'background', default: 0, min: 0, max: 100, advanced: true, format: 'ratio' },
  overlayDark: { kind: 'number', group: 'background', default: 30, min: 0, max: 100, advanced: true, format: 'ratio' },

  // -- Dynamic scenes ------------------------------------------------------------------------
  // `scenes` narrows a control to the kinds it means anything for: leaves never accumulate and
  // never collide, stars and sunbeams do not touch the interface at all.
  sceneEnabled: { kind: 'toggle', group: 'scene', default: true },
  sceneParticleSize: { kind: 'number', group: 'scene', default: 100, min: 50, max: 200, format: 'scale' },
  sceneSpeed: { kind: 'number', group: 'scene', default: 100, min: 25, max: 200, format: 'scale' },
  sceneWind: { kind: 'number', group: 'scene', default: 100, min: 0, max: 200, format: 'scale', scenes: ['leaves', 'snow', 'rain', 'bubbles'] },
  sceneWindDirection: { kind: 'number', group: 'scene', default: 0, min: -100, max: 100, format: 'scale', scenes: ['leaves', 'snow', 'rain'] },
  sceneDepth: { kind: 'number', group: 'scene', default: 100, min: 0, max: 150, advanced: true, format: 'scale' },
  sceneForegroundBlur: { kind: 'number', group: 'scene', default: 100, min: 0, max: 200, advanced: true, format: 'scale', scenes: ['leaves', 'snow', 'bubbles'] },
  // Rain-only: it is the one scene that touches the interface. Snow and leaves are purely
  // airborne, and stars, bubbles and sunbeams never collide either.
  sceneCollision: { kind: 'number', group: 'scene', default: 100, min: 0, max: 150, advanced: true, format: 'scale', scenes: ['rain'] },
  sceneSplash: { kind: 'number', group: 'scene', default: 100, min: 0, max: 150, advanced: true, format: 'scale', scenes: ['rain'] },
  sceneReducedMotion: { kind: 'toggle', group: 'scene', default: true, advanced: true },
  sceneLowPerformance: { kind: 'toggle', group: 'scene', default: false, advanced: true },

  // -- Typography ----------------------------------------------------------------------------
  pageTitleColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-title-text' },
  pageTitleSize: { kind: 'number', group: 'typography', default: 30, min: 18, max: 52, format: 'px', cssVar: '--public-title-text-size' },
  descriptionColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-description-text' },
  descriptionSize: { kind: 'number', group: 'typography', default: 14, min: 11, max: 22, format: 'px', cssVar: '--public-description-text-size' },
  searchTextColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-search-text' },
  placeholderColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-placeholder-text' },
  fontWeight: { kind: 'number', group: 'typography', default: 400, min: 300, max: 800, step: 50, advanced: true, format: 'raw', cssVar: '--public-font-weight' },
  fontFamily: { kind: 'enum', group: 'typography', default: 'system', options: ['system', 'sans', 'serif', 'rounded', 'mono'], advanced: true },
  fontFamilyZh: { kind: 'enum', group: 'typography', default: 'inherit', options: ['inherit', 'heiti', 'songti', 'kaiti', 'yuanti'], advanced: true },
  fontFamilyEn: { kind: 'enum', group: 'typography', default: 'inherit', options: ['inherit', 'inter', 'georgia', 'jetbrains'], advanced: true },
  lineHeight: { kind: 'number', group: 'typography', default: 150, min: 110, max: 210, step: 5, advanced: true, format: 'scale', cssVar: '--public-line-height' },
  bookmarkTextColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-bookmark-text' },
  bookmarkTextSize: { kind: 'number', group: 'typography', default: 14, min: 12, max: 18, format: 'px', cssVar: '--public-bookmark-text-size' },
  notabTextColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-notab-text' },
  notabTextSize: { kind: 'number', group: 'typography', default: 15, min: 12, max: 18, format: 'px', cssVar: '--public-notab-text-size' },
  folderTextColor: { kind: 'color', group: 'typography', default: '#ffffff', cssVar: '--public-folder-text' },
  folderTextSize: { kind: 'number', group: 'typography', default: 18, min: 12, max: 22, format: 'px', cssVar: '--public-folder-text-size' },

  // -- Mirrored legacy values ----------------------------------------------------------------
  categoryTextColor: { kind: 'color', group: 'typography', default: '#ffffff', legacy: true, cssVar: '--public-category-text' },
  tabColor: { kind: 'color', group: 'search', default: '#f7f8fb', legacy: true, cssVar: '--public-tab-color' },
  modalRadius: { kind: 'number', group: 'folders', default: 8, min: 0, max: 32, legacy: true, format: 'px', cssVar: '--public-modal-radius' },
  modalOpacity: { kind: 'number', group: 'folders', default: 85, min: 20, max: 96, legacy: true, format: 'ratio', cssVar: '--public-modal-opacity' },
  modalBlur: { kind: 'number', group: 'folders', default: 24, min: 0, max: 40, legacy: true, format: 'px', cssVar: '--public-modal-blur' },
  tabRadius: { kind: 'number', group: 'search', default: 28, min: 0, max: 28, legacy: true, format: 'px', cssVar: '--public-tab-radius' },
  tabOpacity: { kind: 'number', group: 'search', default: 26, min: 12, max: 96, legacy: true, format: 'ratio', cssVar: '--public-tab-opacity' },
  tabBlur: { kind: 'number', group: 'search', default: 10, min: 0, max: 32, legacy: true, format: 'px', cssVar: '--public-tab-blur' },
  adminRadius: { kind: 'number', group: 'glass', default: 8, min: 0, max: 20, legacy: true },
  adminOpacity: { kind: 'number', group: 'glass', default: 72, min: 40, max: 100, legacy: true },
  adminBlur: { kind: 'number', group: 'glass', default: 10, min: 0, max: 24, legacy: true },
};

const FIELD_KEYS = Object.keys(APPEARANCE_FIELDS) as AppearanceKey[];

/** Editable fields in editor order: the mirrored legacy values are skipped. */
export const EDITABLE_APPEARANCE_KEYS = FIELD_KEYS.filter((key) => !APPEARANCE_FIELDS[key].legacy);

// Mirrored so the shipped defaults are internally consistent: `tabOpacity` and friends must
// never disagree with the settings that replaced them, not even before a site has been saved.
export const appearanceDefaults: AppearanceSettings = applyAppearanceMirrors(
  Object.fromEntries(
    FIELD_KEYS.map((key) => [key, APPEARANCE_FIELDS[key].default]),
  ) as unknown as AppearanceSettings,
);

/**
 * Density presets are quick defaults, not a lock: they write the layout values once and every
 * one of them stays individually adjustable afterwards.
 */
export const DENSITY_PRESETS: Record<DensityPreset, Partial<AppearanceSettings>> = {
  compact: {
    folderGapX: 12, folderGapY: 14, pagePaddingX: 20, searchGridGap: 16,
    bookmarkRowHeight: 30, bookmarkGapY: 2, folderTitleGap: 6, notabHeight: 32, lineHeight: 130,
  },
  balanced: {
    folderGapX: appearanceDefaults.folderGapX,
    folderGapY: appearanceDefaults.folderGapY,
    pagePaddingX: appearanceDefaults.pagePaddingX,
    searchGridGap: appearanceDefaults.searchGridGap,
    bookmarkRowHeight: appearanceDefaults.bookmarkRowHeight,
    bookmarkGapY: appearanceDefaults.bookmarkGapY,
    folderTitleGap: appearanceDefaults.folderTitleGap,
    notabHeight: appearanceDefaults.notabHeight,
    lineHeight: appearanceDefaults.lineHeight,
  },
  spacious: {
    folderGapX: 32, folderGapY: 36, pagePaddingX: 48, searchGridGap: 44,
    bookmarkRowHeight: 46, bookmarkGapY: 8, folderTitleGap: 16, notabHeight: 46, lineHeight: 170,
  },
};

/** Glass presets stay adjustable after they are applied; they only seed the values. */
export const GLASS_PRESETS = {
  performance: {
    cardRadius: 6, cardOpacity: 72, cardBlur: 0,
    searchRadius: 24, searchOpacity: 62, searchBlur: 0,
    glassBorderOpacity: 34, glassBorderWidth: 1,
    glassShadowStrength: 14, glassShadowSpread: 10,
    glassSaturation: 100, glassHighlight: 12, glassDarkOverlay: 48,
  },
  balanced: {
    cardRadius: appearanceDefaults.cardRadius,
    cardOpacity: appearanceDefaults.cardOpacity,
    cardBlur: appearanceDefaults.cardBlur,
    searchRadius: appearanceDefaults.searchRadius,
    searchOpacity: appearanceDefaults.searchOpacity,
    searchBlur: appearanceDefaults.searchBlur,
    glassBorderOpacity: appearanceDefaults.glassBorderOpacity,
    glassBorderWidth: appearanceDefaults.glassBorderWidth,
    glassShadowStrength: appearanceDefaults.glassShadowStrength,
    glassShadowSpread: appearanceDefaults.glassShadowSpread,
    glassSaturation: appearanceDefaults.glassSaturation,
    glassHighlight: appearanceDefaults.glassHighlight,
    glassDarkOverlay: appearanceDefaults.glassDarkOverlay,
  },
  clear: {
    cardRadius: 12, cardOpacity: 22, cardBlur: 22,
    searchRadius: 30, searchOpacity: 30, searchBlur: 26,
    glassBorderOpacity: 20, glassBorderWidth: 1,
    glassShadowStrength: 42, glassShadowSpread: 34,
    glassSaturation: 140, glassHighlight: 48, glassDarkOverlay: 34,
  },
} satisfies Record<string, Partial<AppearanceSettings>>;

export type GlassPreset = keyof typeof GLASS_PRESETS;

const FONT_STACKS: Record<FontChoice, string> = {
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "'Nunito', 'Quicksand', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
};

const ZH_FONT_STACKS: Record<Exclude<FontChoiceZh, 'inherit'>, string> = {
  heiti: "'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif",
  songti: "'Songti SC', SimSun, 'Source Han Serif SC', serif",
  kaiti: "'Kaiti SC', KaiTi, STKaiti, serif",
  yuanti: "'Yuanti SC', YouYuan, 'Hiragino Maru Gothic ProN', sans-serif",
};

const EN_FONT_STACKS: Record<Exclude<FontChoiceEn, 'inherit'>, string> = {
  inter: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  jetbrains: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
};

/**
 * Latin first, then the CJK family, so English glyphs come from the English choice while
 * Chinese text falls through to the Chinese one.
 */
export function fontStack(appearance: AppearanceSettings): string {
  const base = FONT_STACKS[appearance.fontFamily] ?? FONT_STACKS.system;
  const latin = appearance.fontFamilyEn === 'inherit' ? base : EN_FONT_STACKS[appearance.fontFamilyEn];
  const han = appearance.fontFamilyZh === 'inherit' ? '' : ZH_FONT_STACKS[appearance.fontFamilyZh];
  if (!han) return latin;
  const generic = appearance.fontFamilyZh === 'songti' || appearance.fontFamilyZh === 'kaiti'
    ? 'serif'
    : 'sans-serif';
  return `${withoutGenericFamily(latin)}, ${withoutGenericFamily(han)}, ${generic}`;
}

function withoutGenericFamily(stack: string) {
  const generics = new Set(['serif', 'sans-serif', 'monospace', 'system-ui']);
  return stack.split(',').map((family) => family.trim()).filter((family) => !generics.has(family)).join(', ');
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

  const typed = result as unknown as AppearanceSettings;
  // Older payloads only carried `categoryTextColor`; treat it as the folder and Notab colour
  // when the newer keys are absent, then re-establish the mirrors.
  typed.notabTextColor = normalizedHex(saved.notabTextColor, typed.categoryTextColor);
  typed.folderTextColor = normalizedHex(saved.folderTextColor, typed.categoryTextColor);
  return applyAppearanceMirrors(typed);
}

/** Keeps the mirrored legacy values in step with the settings that replaced them. */
function applyAppearanceMirrors(appearance: AppearanceSettings): AppearanceSettings {
  appearance.categoryTextColor = appearance.folderTextColor;
  appearance.tabColor = appearance.searchColor;
  appearance.tabRadius = appearance.searchRadius;
  appearance.tabOpacity = appearance.searchOpacity;
  appearance.tabBlur = appearance.searchBlur;
  appearance.modalRadius = appearance.cardRadius;
  appearance.modalOpacity = appearance.cardOpacity;
  appearance.modalBlur = appearance.cardBlur;
  return appearance;
}

export function appearanceSettingsForSave(appearance: AppearanceSettings): AppearanceSettings {
  return applyAppearanceMirrors({ ...appearance });
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

export function toAppearanceCssVars(appearance: AppearanceSettings): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const key of FIELD_KEYS) {
    const field: AppearanceField = APPEARANCE_FIELDS[key];
    if (!field.cssVar) continue;
    const value = appearance[key];
    if (field.kind === 'number') {
      vars[field.cssVar] = formatNumber(value as number, field.format);
    } else if (field.kind === 'color') {
      vars[field.cssVar] = value as string;
      vars[`${field.cssVar}-rgb`] = hexToRgb(value as string);
    } else if (field.kind === 'toggle') {
      vars[field.cssVar] = value ? '1' : '0';
    } else {
      vars[field.cssVar] = String(value);
    }
  }

  // Composites, and values that need a keyword rather than a number.
  vars['--public-font-family'] = fontStack(appearance);
  vars['--public-bg-position'] = appearance.backgroundPosition === 'center'
    ? 'center'
    : `center ${appearance.backgroundPosition}`;
  // Turning the hover animation off has to zero the duration as well as the scale, or the
  // highlight still fades in on its own.
  vars['--public-hover-duration'] = appearance.hoverAnimation ? '200ms' : '0ms';
  vars['--public-hover-scale'] = appearance.hoverAnimation ? (appearance.hoverScale / 100).toFixed(3) : '1';
  // Plain `center` lets the flex line overflow equally on both sides; since a scrollable LTR
  // container can never reach a negative scrollLeft, the start-side overflow (the first tab)
  // becomes permanently unreachable once the strip is wider than the viewport. `safe center`
  // falls back to start alignment exactly when that overflow would occur, so scrollLeft 0 always
  // shows the first tab in full while still centering short, non-overflowing tab strips.
  vars['--public-notab-justify'] = appearance.notabAlign === 'left' ? 'flex-start' : 'safe center';
  vars['--public-notab-wrap'] = appearance.notabOverflow === 'wrap' ? 'wrap' : 'nowrap';
  vars['--public-notab-overflow-x'] = appearance.notabOverflow === 'wrap' ? 'visible' : 'auto';

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

export function toSceneTuning(appearance: AppearanceSettings): SceneTuning {
  return {
    enabled: appearance.sceneEnabled,
    particleSize: appearance.sceneParticleSize / 100,
    speed: appearance.sceneSpeed / 100,
    wind: appearance.sceneWind / 100,
    windDirection: appearance.sceneWindDirection / 100,
    depth: appearance.sceneDepth / 100,
    foregroundBlur: appearance.sceneForegroundBlur / 100,
    collision: appearance.sceneCollision / 100,
    splash: appearance.sceneSplash / 100,
    followReducedMotion: appearance.sceneReducedMotion,
    lowPerformance: appearance.sceneLowPerformance,
  };
}

/** True when the control means anything for the given scene. */
export function fieldAppliesToScene(key: AppearanceKey, kind: SceneKind | undefined): boolean {
  const scenes = APPEARANCE_FIELDS[key].scenes;
  if (!scenes) return true;
  return Boolean(kind) && scenes.includes(kind as SceneKind);
}

/** Keys whose value differs from the shipped default, used for the "changed" markers. */
export function changedAppearanceKeys(appearance: AppearanceSettings): AppearanceKey[] {
  return EDITABLE_APPEARANCE_KEYS.filter((key) => appearance[key] !== appearanceDefaults[key]);
}
