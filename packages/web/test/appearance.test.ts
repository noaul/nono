import { describe, expect, it } from 'vitest';
import { appearanceDefaults, fontStack, getAppearanceSettings, toAppearanceCssVars } from '../src/utils/appearance';

describe('appearance settings', () => {
  it('normalizes saved UI controls and clamps unsafe values', () => {
    expect(getAppearanceSettings({
      appearance: {
        cardColor: 'not-a-color',
        cardRadius: 99,
        cardOpacity: -10,
        cardBlur: 80,
        searchColor: '#A1B2C3',
        searchOpacity: '38',
        bookmarkTextColor: '#112233',
        bookmarkTextSize: 99,
        density: 'cramped',
        fontFamily: 'serif',
      },
    })).toEqual({
      ...appearanceDefaults,
      cardRadius: 24,
      cardOpacity: 12,
      cardBlur: 32,
      searchColor: '#a1b2c3',
      searchOpacity: 38,
      bookmarkTextColor: '#112233',
      bookmarkTextSize: 18,
      fontFamily: 'serif',
    });
  });

  it('keeps only the short editable set and ignores every retired key in old payloads', () => {
    expect(Object.keys(appearanceDefaults)).toHaveLength(23);
    const settings = getAppearanceSettings({
      appearance: {
        categoryTextColor: '#334455', tabColor: '#a1b2c3', adminBlur: 6,
        notabTextColor: '#223344', folderGapX: 40, glassHighlight: 90, sceneWind: 150, fontFamilyZh: 'songti',
      },
    });

    expect(settings).toEqual(appearanceDefaults);
  });

  it('converts appearance values into stable CSS custom properties', () => {
    expect(toAppearanceCssVars(appearanceDefaults)).toMatchObject({
      '--public-card-color': '#f7f8fb',
      '--public-card-color-rgb': '247, 248, 251',
      '--public-card-radius': '8px',
      '--public-card-opacity': '0.26',
      '--public-card-blur': '18px',
      '--public-search-color': '#f7f8fb',
      '--public-search-color-rgb': '247, 248, 251',
      '--public-search-opacity': '0.34',
      '--public-bookmark-text': '#ffffff',
      '--public-bookmark-text-rgb': '255, 255, 255',
      '--public-bookmark-text-size': '14px',
    });
    const names = Object.keys(toAppearanceCssVars(appearanceDefaults));
    expect(names.filter((name) => /^--public-(category|tab|modal|glass)-/.test(name))).toEqual([]);
    expect(names).not.toContain('--admin-surface-radius');
  });

  it('derives spacing from density and secondary colours from the main ones', () => {
    const vars = toAppearanceCssVars({
      ...appearanceDefaults,
      density: 'compact',
      cardBlur: 24,
      bookmarkTextColor: '#123456',
      pageTitleColor: '#abcdef',
    });

    expect(vars['--public-bookmark-row-height']).toBe('30px');
    expect(vars['--public-folder-gap-x']).toBe('12px');
    expect(vars['--public-line-height']).toBe('1.3');
    expect(toAppearanceCssVars(appearanceDefaults)['--public-bookmark-row-height']).toBe('38px');
    for (const name of ['--public-notab-text', '--public-folder-text', '--public-search-text', '--public-placeholder-text']) {
      expect(vars[name]).toBe('#123456');
      expect(vars[`${name}-rgb`]).toBe('18, 52, 86');
    }
    expect(vars['--public-description-text']).toBe('#abcdef');
    expect(vars['--public-search-blur']).toBe('24px');
  });

  it('keeps the default centered notab strip reachable when it overflows on mobile', () => {
    // A plain `center` (no `safe`) lets the flex line overflow equally on both sides. An
    // `overflow-x: auto` container can never scroll to a negative scrollLeft in LTR, so the
    // start-side overflow — the first ("All") tab — became permanently unreachable once the
    // strip was wider than the viewport. `safe center` falls back to start alignment exactly
    // when that overflow would occur, keeping the first tab fully visible at scrollLeft 0.
    expect(toAppearanceCssVars(appearanceDefaults)['--public-notab-justify']).toBe('safe center');
    expect(toAppearanceCssVars({ ...appearanceDefaults, notabAlign: 'left' })['--public-notab-justify']).toBe('flex-start');
  });

  it('lets a centred NoTab strip hug its tabs while a left-aligned one keeps the full row', () => {
    expect(toAppearanceCssVars(appearanceDefaults)['--public-notab-strip-width']).toBe('fit-content');
    expect(toAppearanceCssVars({ ...appearanceDefaults, notabAlign: 'left' })['--public-notab-strip-width']).toBe('min(100%, 1200px)');
  });

  it('maps each font choice to one stack, falling back to the system stack', () => {
    expect(fontStack({ fontFamily: 'serif' })).toContain('Georgia');
    expect(fontStack({ fontFamily: 'nope' as never })).toBe(fontStack({ fontFamily: 'system' }));
  });
});
