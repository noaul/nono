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
        searchRadius: '30',
        searchOpacity: 38,
        searchBlur: 18,
        bookmarkTextColor: '#112233',
        bookmarkTextSize: 99,
        notabTextColor: '#223344',
        notabTextSize: '16',
        folderTextColor: '#334455',
        folderTextSize: 8,
        categoryTextColor: null,
        tabColor: '#DDEEFF',
        modalRadius: 99,
        modalOpacity: '38',
        modalBlur: Number.NaN,
        tabRadius: -8,
        tabOpacity: 120,
        tabBlur: -12,
        adminRadius: [],
        adminOpacity: 20,
        adminBlur: {},
      },
    })).toEqual({
      ...appearanceDefaults,
      cardColor: appearanceDefaults.cardColor,
      cardRadius: 24,
      cardOpacity: 12,
      cardBlur: 32,
      searchColor: '#a1b2c3',
      searchRadius: 30,
      searchOpacity: 38,
      searchBlur: 18,
      bookmarkTextColor: '#112233',
      bookmarkTextSize: 18,
      notabTextColor: '#223344',
      notabTextSize: 16,
      folderTextColor: '#334455',
      folderTextSize: 12,
      categoryTextColor: '#334455',
      tabColor: '#a1b2c3',
      modalRadius: 24,
      modalOpacity: 12,
      modalBlur: 32,
      tabRadius: 30,
      tabOpacity: 38,
      tabBlur: 18,
      adminRadius: appearanceDefaults.adminRadius,
      adminOpacity: 40,
      adminBlur: appearanceDefaults.adminBlur,
    });
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
      '--public-search-radius': '28px',
      '--public-search-opacity': '0.34',
      '--public-search-blur': '20px',
      '--public-bookmark-text': '#ffffff',
      '--public-bookmark-text-rgb': '255, 255, 255',
      '--public-bookmark-text-size': '14px',
      '--public-notab-text': '#ffffff',
      '--public-notab-text-rgb': '255, 255, 255',
      '--public-notab-text-size': '15px',
      '--public-folder-text': '#ffffff',
      '--public-folder-text-rgb': '255, 255, 255',
      '--public-folder-text-size': '18px',
      '--public-category-text': '#ffffff',
      '--public-category-text-rgb': '255, 255, 255',
      '--public-tab-color': '#f7f8fb',
      '--public-tab-color-rgb': '247, 248, 251',
      '--public-modal-radius': '8px',
      '--public-modal-opacity': '0.26',
      '--public-modal-blur': '18px',
      '--public-tab-radius': '28px',
      '--public-tab-opacity': '0.34',
      '--public-tab-blur': '20px',
    });
    expect(toAppearanceCssVars(appearanceDefaults)).not.toHaveProperty('--admin-surface-radius');
  });

  it('places an explicitly selected Chinese font before the generic fallback', () => {
    const stack = fontStack({
      ...appearanceDefaults,
      fontFamilyEn: 'inter',
      fontFamilyZh: 'songti',
    });

    expect(stack.indexOf("'Songti SC'")).toBeGreaterThan(stack.indexOf("'Inter'"));
    expect(stack.indexOf("'Songti SC'")).toBeLessThan(stack.lastIndexOf('serif'));
    expect(stack.indexOf('sans-serif')).toBe(-1);
  });
});
