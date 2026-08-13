import { describe, expect, it } from 'vitest';
import { normalizeSiteSettings } from '../src/utils/site-settings.js';

describe('NoDesk workbench settings', () => {
  it('normalizes the quick-entry visibility setting to a boolean default', () => {
    expect(normalizeSiteSettings({
      nodeskWorkbench: { quickEntriesVisible: false },
    }).nodeskWorkbench).toEqual({ quickEntriesVisible: false });

    expect(() => normalizeSiteSettings({
      nodeskWorkbench: { quickEntriesVisible: 'no' },
    })).toThrow();
  });
});
