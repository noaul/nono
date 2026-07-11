import { describe, expect, it } from 'vitest';
import { appearanceDefaults, getAppearanceSettings, toAppearanceCssVars } from '../src/utils/appearance';

describe('appearance settings', () => {
  it('normalizes saved UI controls and clamps unsafe values', () => {
    expect(getAppearanceSettings({
      appearance: {
        cardRadius: 99,
        cardOpacity: -10,
        cardBlur: 80,
        searchRadius: 30,
        searchOpacity: 38,
        searchBlur: 18,
      },
    })).toEqual({
      ...appearanceDefaults,
      cardRadius: 24,
      cardOpacity: 12,
      cardBlur: 32,
      searchRadius: 30,
      searchOpacity: 38,
      searchBlur: 18,
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
    });
  });
});
