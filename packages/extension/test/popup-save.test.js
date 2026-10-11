import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVED_BADGE_KEY, SAVED_LOOKUP_STALE_MESSAGE } from '../shared/saved-badge.js';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ code: 0, data, message: '' }) });

describe('popup save', () => {
  it('saves pages it cannot script by URL and title, and marks only that tab', async () => {
    document.documentElement.innerHTML = await readFile(path.resolve('popup/popup.html'), 'utf8');
    const storeTab = { id: 5, url: 'https://chromewebstore.google.com/detail/nono/abc', title: 'NoNo - Chrome Web Store' };
    const chrome = {
      runtime: { getManifest: () => ({ version: '0.6.0' }), sendMessage: vi.fn(async () => undefined) },
      storage: { local: { get: async () => ({ serverUrl: 'https://nono.example', token: 'nono_token', lastFolderId: '1' }), set: async () => {}, remove: async () => {} } },
      permissions: { contains: async () => true },
      tabs: {
        query: async () => [storeTab],
        sendMessage: vi.fn(async () => { throw new Error('Could not establish connection'); }),
      },
      scripting: { executeScript: vi.fn(async () => { throw new Error('The extensions gallery cannot be scripted.'); }) },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
      i18n: { getUILanguage: () => 'en' },
    };
    const fetch = vi.fn(async (url, init = {}) => {
      if (url.endsWith('/api/auth/session')) return ok({ user: { username: 'me' } });
      if (url.endsWith('/api/admin/tokens/current')) return ok({ expiresAt: null });
      if (url.endsWith('/api/admin/folders')) return ok([{ id: 1, name: 'Inbox' }]);
      if (url.endsWith('/api/admin/links') && init.method === 'GET') return ok([]);
      if (url.endsWith('/api/admin/links')) return ok({ id: 9, name: 'NoNo', url: storeTab.url });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal('chrome', chrome);
    vi.stubGlobal('fetch', fetch);

    await import('../popup/popup.js');
    await vi.waitFor(() => expect(document.querySelector('#folderSelect').value).toBe('1'));
    expect(chrome.scripting.executeScript).toHaveBeenCalled();

    document.querySelector('#saveBookmark').click();
    await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenCalled());

    const post = fetch.mock.calls.find(([url, init]) => url.endsWith('/api/admin/links') && init.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({ url: storeTab.url, folderId: 1 });
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'OK', tabId: 5 });
    expect(chrome.action.setBadgeText.mock.calls.every(([details]) => details.tabId === 5)).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: SAVED_LOOKUP_STALE_MESSAGE, url: storeTab.url });
  });
});

describe('background saved badge', () => {
  async function loadBackground({ tabs = [] } = {}) {
    const listeners = {};
    const on = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
    const stored = { serverUrl: 'https://nono.example', token: 'nono_token', [SAVED_BADGE_KEY]: true };
    const badges = new Map(tabs.map((tab) => [tab.id, tab.badge]));
    const chrome = {
      runtime: { onInstalled: on('installed'), onStartup: on('startup'), onMessage: on('message') },
      storage: { local: { get: async (keys) => Object.fromEntries(keys.map((key) => [key, stored[key]])) }, onChanged: on('storage') },
      permissions: { contains: async () => true },
      contextMenus: { onClicked: on('menu') },
      commands: { onCommand: on('command') },
      tabs: { onActivated: on('activated'), onUpdated: on('updated'), get: async (tabId) => tabs.find((tab) => tab.id === tabId), query: async () => tabs },
      action: {
        setBadgeBackgroundColor: vi.fn(),
        setBadgeText: vi.fn(({ text, tabId }) => badges.set(tabId, text)),
        getBadgeText: async ({ tabId }) => badges.get(tabId) ?? '',
        setTitle: vi.fn(),
      },
      i18n: { getUILanguage: () => 'en' },
    };
    const fetch = vi.fn(async () => ok({ saved: false }));
    vi.stubGlobal('chrome', chrome);
    vi.stubGlobal('fetch', fetch);
    await import('../background.js');
    return { listeners, chrome, fetch, badges };
  }

  it('looks a page up again once the popup has saved it', async () => {
    const tab = { id: 3, url: 'https://example.com/a', active: true };
    const { listeners, fetch } = await loadBackground({ tabs: [tab] });
    await listeners.activated({ tabId: 3 });
    await listeners.activated({ tabId: 3 });
    expect(fetch).toHaveBeenCalledTimes(1);

    listeners.message({ type: SAVED_LOOKUP_STALE_MESSAGE, url: tab.url });
    await listeners.activated({ tabId: 3 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('takes the marks down when the setting is switched off', async () => {
    const { listeners, chrome, badges } = await loadBackground({ tabs: [{ id: 1, badge: '✓' }, { id: 2, badge: '!' }] });
    listeners.storage({ [SAVED_BADGE_KEY]: { oldValue: true, newValue: false } }, 'local');
    await vi.waitFor(() => expect(badges.get(1)).toBe(''));
    expect(badges.get(2)).toBe('!');
    expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(1);
  });
});
