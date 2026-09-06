import { describe, expect, it } from 'vitest';
import { getNavigationEntries } from '../src/utils/navigationEntries';
import { scopesForProfile } from '../src/utils/tokenScopes';

describe('retired application navigation', () => {
  it('offers only supported default applications', () => {
    expect(getNavigationEntries(null).map(entry => entry.url)).toEqual(['/nomoney', '/yumi', '/nostar']);
  });
  it('removes persisted clipping entries without discarding custom bookmark navigation', () => {
    expect(getNavigationEntries({ navigationEntriesVersion: 5, navigationEntries: [
      { id: 'clipper', label: 'Clipper', url: '/clipper' },
      { id: 'old-reading', label: 'Reading', url: '/clipper/?clip=8' },
      { id: 'bookmarks', label: 'Bookmarks', url: '/' },
    ] }).map(entry => entry.url)).toEqual(['/']);
  });
  it('issues bookmark and AI permissions for the extension profile', () => {
    expect(scopesForProfile('extension')).toEqual(['bookmarks:read', 'bookmarks:write', 'ai:analyze']);
  });
});
