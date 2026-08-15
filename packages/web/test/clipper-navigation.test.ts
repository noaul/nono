import { describe, expect, it } from 'vitest';
import {
  defaultNavigationEntries,
  getNavigationEntries,
  navigationEntriesVersion,
} from '../src/utils/navigationEntries';
import { requiresDocumentNavigation, resolveInternalRedirect } from '../src/utils/redirect';

describe('Clipper navigation entry', () => {
  it('ships as a default entry', () => {
    const clipper = defaultNavigationEntries.find((entry) => entry.id === 'clipper');

    expect(clipper).toBeDefined();
    expect(clipper?.url).toBe('/clipper');
    expect(clipper?.enabled).toBe(true);
  });

  /**
   * Existing installs have their navigation entries persisted in site settings. Without a version
   * bump the saved list wins and Clipper never appears for anyone who already customized it.
   */
  it('is merged into a saved list from an older version', () => {
    const entries = getNavigationEntries({
      navigationEntriesVersion: navigationEntriesVersion - 1,
      navigationEntries: [
        { id: 'nostar', label: 'NoStar', url: '/nostar', icon: 'star', enabled: true },
      ],
    });

    expect(entries.map((entry) => entry.id)).toContain('clipper');
  });

  it('respects a saved list that is already current', () => {
    const entries = getNavigationEntries({
      navigationEntriesVersion,
      navigationEntries: [
        { id: 'nostar', label: 'NoStar', url: '/nostar', icon: 'star', enabled: true },
      ],
    });

    // The user deliberately removed it; a current version must not add it back.
    expect(entries.map((entry) => entry.id)).not.toContain('clipper');
  });

  it('opens in a new tab like the other product entries', () => {
    const [clipper] = getNavigationEntries({
      navigationEntriesVersion,
      navigationEntries: [
        { id: 'clipper', label: 'Clipper', url: '/clipper', icon: 'scissors', enabled: true, openInNewTab: false },
      ],
    });

    expect(clipper.openInNewTab).toBe(true);
  });
});

describe('Clipper post-login routing', () => {
  it('needs a document navigation because it is a separate bundle', () => {
    expect(requiresDocumentNavigation('/clipper')).toBe(true);
    expect(requiresDocumentNavigation('/clipper/')).toBe(true);
    expect(requiresDocumentNavigation('/clipper/anything')).toBe(true);
  });

  it('does not match unrelated paths that merely start with the same letters', () => {
    expect(requiresDocumentNavigation('/clipperx')).toBe(false);
  });

  it('accepts /clipper/ as an internal redirect target', () => {
    expect(resolveInternalRedirect('/clipper/', '/')).toBe('/clipper/');
  });
});
