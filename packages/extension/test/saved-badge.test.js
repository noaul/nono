import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../shared/i18n.js';
import { clearSavedBadge, createLookupCache, refreshSavedBadge, SAVED_BADGE_KEY } from '../shared/saved-badge.js';
import { findDuplicateLink } from '../shared/popup-workflow.js';

function fakeChrome(stored = { serverUrl: 'https://nono.example', token: 'nono_token', [SAVED_BADGE_KEY]: true }, { badge = '', tabUrls = {} } = {}) {
  return {
    storage: { local: { get: vi.fn(async (keys) => Object.fromEntries(keys.map((key) => [key, stored[key]]))) } },
    permissions: { contains: vi.fn(async () => true) },
    tabs: { get: vi.fn(async (tabId) => ({ id: tabId, url: tabUrls[tabId] ?? (tabId === tab.id ? tab.url : undefined) })) },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setTitle: vi.fn(), getBadgeText: vi.fn(async () => badge) },
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

  it('takes an earlier mark down when the page can no longer be confirmed as saved', async () => {
    const offline = vi.fn(async () => { throw new Error('offline'); });
    const cases = [
      [fakeChrome({ serverUrl: 'https://nono.example', token: 't', [SAVED_BADGE_KEY]: false }, { badge: '✓' }), tab, respond(saved)],
      [fakeChrome(undefined, { badge: '✓' }), { id: 1, url: 'https://nono.example/admin' }, respond(saved)],
      [fakeChrome(undefined, { badge: '✓' }), { id: 1, url: 'chrome://extensions' }, respond(saved)],
      [fakeChrome(undefined, { badge: '✓' }), tab, offline],
    ];
    for (const [chrome, target, fetch] of cases) {
      expect(await refreshSavedBadge(target, chrome, createLookupCache(), fetch)).toBeNull();
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: target.id });
    }
  });

  it('leaves a one-click save result alone when clearing the mark', async () => {
    const chrome = fakeChrome(undefined, { badge: '!' });
    await clearSavedBadge(7, chrome);
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it('does not mark a tab that navigated away while the lookup was in flight', async () => {
    const chrome = fakeChrome(undefined, { tabUrls: { 7: 'https://example.com/elsewhere' } });
    const fetch = respond(saved);
    expect(await refreshSavedBadge(tab, chrome, createLookupCache(), fetch)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    expect(chrome.action.setTitle).not.toHaveBeenCalled();

    const failing = fakeChrome(undefined, { badge: '✓', tabUrls: { 7: 'https://example.com/elsewhere' } });
    await refreshSavedBadge(tab, failing, createLookupCache(), vi.fn(async () => { throw new Error('offline'); }));
    expect(failing.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('duplicate matching', () => {
  it('matches the server: host case is ignored, path case is not', () => {
    const links = [{ id: 1, url: 'https://Example.com/Path' }];
    expect(findDuplicateLink(links, 'https://example.com/Path')?.id).toBe(1);
    expect(findDuplicateLink(links, 'https://example.com/path')).toBeNull();
  });
});
