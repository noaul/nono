import { describe, expect, it } from 'vitest';
import { appearanceDefaults, getAppearanceSettings, toAppearanceCssVars } from '../src/utils/appearance';

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
        categoryTextColor: null,
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
      categoryTextColor: appearanceDefaults.categoryTextColor,
      modalRadius: 32,
      modalOpacity: 38,
      modalBlur: appearanceDefaults.modalBlur,
      tabRadius: 0,
      tabOpacity: 96,
      tabBlur: 0,
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
      '--public-category-text': '#ffffff',
      '--public-category-text-rgb': '255, 255, 255',
      '--public-modal-radius': '8px',
      '--public-modal-opacity': '0.85',
      '--public-modal-blur': '24px',
      '--public-tab-radius': '28px',
      '--public-tab-opacity': '0.12',
      '--public-tab-blur': '10px',
      '--admin-surface-radius': '8px',
      '--admin-surface-opacity': '0.72',
      '--admin-surface-blur': '10px',
    });
  });
});
