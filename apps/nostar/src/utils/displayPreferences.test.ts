import { describe, expect, it } from 'vitest';
import {
  normalizeDisplayPreferences,
  normalizeListSettings,
} from './displayPreferences';
describe('scoped display preferences', () => {
  it('fills older settings and rejects malformed values', () => {
    expect(
      normalizeDisplayPreferences({
        fontSize: 'huge',
        reducedMotion: 'yes',
        cardFields: { stars: false, license: 'yes' },
      })
    ).toEqual({
      fontSize: 'default',
      reducedMotion: false,
      cardFields: {
        description: true,
        tags: true,
        language: true,
        stars: false,
        license: true,
        updated: true,
      },
    });
  });
  it('retains explicit field choices and accessible appearance', () => {
    expect(
      normalizeDisplayPreferences({
        fontSize: 'large',
        reducedMotion: true,
        cardFields: { description: false },
      })
    ).toMatchObject({
      fontSize: 'large',
      reducedMotion: true,
      cardFields: { description: false },
    });
  });
  it('validates Lists settings and deduplicates case-insensitive names', () => {
    expect(
      normalizeListSettings(
        { cat: 'LIST_1', bad: 4 },
        { cat: ['A/B', 'a/b', 'invalid', 3] }
      )
    ).toEqual({
      categoryListIdMap: { cat: 'LIST_1' },
      githubListMemberships: { cat: ['a/b'] },
    });
  });
});
