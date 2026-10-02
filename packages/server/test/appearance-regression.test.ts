import { describe, expect, it } from 'vitest';
import { appearanceSchema } from '../src/utils/site-settings.js';

describe('appearance compatibility', () => {
  it('retains restored controls and inert scalar legacy values through a save', () => {
    const saved = appearanceSchema.parse({
      folderGapX: 40, notabTextColor: '#223344', glassHighlight: 90,
      sceneWind: 150, tabBlur: 7, invalidObject: { css: 'bad' },
    });
    expect(saved).toMatchObject({ folderGapX: 40, notabTextColor: '#223344', glassHighlight: 90, sceneWind: 150, tabBlur: 7 });
    expect(saved).not.toHaveProperty('invalidObject');
  });

  it('migrates the short catalogue without losing density and inherited colours', () => {
    expect(appearanceSchema.parse({ density: 'compact', bookmarkTextColor: '#123456', pageTitleColor: '#abcdef', cardBlur: 12 })).toMatchObject({
      folderGapX: 12, bookmarkRowHeight: 30, lineHeight: 130,
      notabTextColor: '#123456', folderTextColor: '#123456', searchTextColor: '#123456',
      descriptionColor: '#abcdef', searchBlur: 12,
    });
  });
});
