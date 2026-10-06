import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../shared/i18n.js';
import { createLookupCache, refreshSavedBadge, SAVED_BADGE_KEY } from '../shared/saved-badge.js';
import { findDuplicateLink } from '../shared/popup-workflow.js';

function fakeChrome(stored = { serverUrl: 'https://nono.example', token: 'nono_token', [SAVED_BADGE_KEY]: true }) {
  return {
    storage: { local: { get: vi.fn(async (keys) => Object.fromEntries(keys.map((key) => [key, stored[key]]))) } },
    permissions: { contains: vi.fn(async () => true) },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setTitle: vi.fn() },
  };
}

const saved = { code: 0, data: { saved: true, link: { id: 3, name: 'MDN', folderPath: ['Work', 'Docs'] } }, message: '' };
const notSaved = { code: 0, data: { saved: false }, message: '' };
const respond = (body) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
const tab = { id: 7, url: 'https://developer.mozilla.org/Web' };

describe('saved-page badge', () => {
  beforeEach(() => setLocale('zh'));

  it('marks a saved page and names its folder in the tooltip', async () => {
    const chrome = fakeChrome();
    const fetch = respond(saved);
    await refreshSavedBadge(tab, chrome, createLookupCache(), fetch);

    expect(fetch).toHaveBeenCalledWith('https://nono.example/api/admin/links/lookup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ url: tab.url }),
      headers: expect.objectContaining({ authorization: 'Bearer nono_token' }),
    }));
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 7 });
    expect(chrome.action.setTitle).toHaveBeenCalledWith({ title: '已收藏为「MDN」· Work / Docs', tabId: 7 });
  });

  it('clears the mark on pages that are not saved', async () => {
    const chrome = fakeChrome();
    await refreshSavedBadge(tab, chrome, createLookupCache(), respond(notSaved));
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 7 });
  });

  it('caches lookups for a minute', async () => {
    const chrome = fakeChrome();
    const cache = createLookupCache();
    const fetch = respond(saved);
    let clock = 0;
    await refreshSavedBadge(tab, chrome, cache, fetch, () => clock);
    clock = 30_000;
    await refreshSavedBadge(tab, chrome, cache, fetch, () => clock);
    clock = 61_000;
    await refreshSavedBadge(tab, chrome, cache, fetch, () => clock);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stays silent when switched off, unconfigured, offline, or on the NoNo server itself', async () => {
    const off = fakeChrome({ serverUrl: 'https://nono.example', token: 't', [SAVED_BADGE_KEY]: false });
    const fetch = respond(saved);
    expect(await refreshSavedBadge(tab, off, createLookupCache(), fetch)).toBeNull();
    expect(await refreshSavedBadge({ id: 1, url: 'https://nono.example/admin' }, fakeChrome(), createLookupCache(), fetch)).toBeNull();
    expect(await refreshSavedBadge({ id: 1, url: 'chrome://extensions' }, fakeChrome(), createLookupCache(), fetch)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    const chrome = fakeChrome();
    await refreshSavedBadge(tab, chrome, createLookupCache(), vi.fn(async () => { throw new Error('offline'); }));
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('duplicate matching', () => {
  it('matches the server: host case is ignored, path case is not', () => {
    const links = [{ id: 1, url: 'https://Example.com/Path' }];
    expect(findDuplicateLink(links, 'https://example.com/Path')?.id).toBe(1);
    expect(findDuplicateLink(links, 'https://example.com/path')).toBeNull();
  });
});
