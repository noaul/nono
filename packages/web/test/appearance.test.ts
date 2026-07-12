import { describe, expect, it } from 'vitest';
import { appearanceDefaults, getAppearanceSettings, toAppearanceCssVars } from '../src/utils/appearance';

describe('appearance settings', () => {
  it('normalizes saved UI controls and clamps unsafe values', () => {
    expect(getAppearanceSettings({
      appearance: {
        cardRadius: 99,
        cardOpacity: -10,
        cardBlur: 80,
        searchRadius: '30',
        searchOpacity: 38,
        searchBlur: 18,
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
      cardRadius: 24,
      cardOpacity: 12,
      cardBlur: 32,
      searchRadius: 30,
      searchOpacity: 38,
      searchBlur: 18,
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
      '--public-card-radius': '8px',
      '--public-card-opacity': '0.52',
      '--public-card-blur': '8px',
      '--public-search-radius': '28px',
      '--public-search-opacity': '0.26',
      '--public-search-blur': '14px',
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
