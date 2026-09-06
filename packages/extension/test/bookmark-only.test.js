import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('bookmark-only extension', () => {
  it('replaces stale installed context menus with bookmark actions only', async () => {
    let installed;
    const menus = new Map([['nono-clip-page', {}]]);
    vi.stubGlobal('chrome', {
      runtime: { onInstalled: { addListener: fn => { installed = fn; } }, onStartup: { addListener() {} } },
      action: { setBadgeBackgroundColor() {} },
      storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } },
      contextMenus: { onClicked: { addListener() {} }, removeAll: async () => menus.clear(), create: item => menus.set(item.id, item) },
      commands: { onCommand: { addListener() {} } },
      i18n: { getUILanguage: () => 'en' },
    });
    await import('../background.js');
    await installed();
    expect([...menus.keys()]).toEqual(['nono-quick-save', 'nono-open-save']);
  });

  it('renders bookmark capture and AI assist without a clipping mode', async () => {
    document.documentElement.innerHTML = await readFile(path.resolve('popup/popup.html'), 'utf8');
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ version: '0.4.2' }) },
      storage: { local: { get: async () => ({}) } },
      i18n: { getUILanguage: () => 'en' },
    });
    await import('../popup/popup.js');
    await vi.waitFor(() => expect(document.querySelector('#settings').classList.contains('hidden')).toBe(false));
    expect(document.querySelector('#saveBookmark')).not.toBeNull();
    expect(document.querySelector('#analyzeBookmark')).not.toBeNull();
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.querySelector('#saveClip')).toBeNull();
  });

  it('ignores retired extraction messages but returns metadata for bookmark AI', async () => {
    let listener;
    vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: fn => { listener = fn; } } } });
    document.title = 'Bookmark page';
    document.body.innerHTML = '<p>Small preview</p>';
    await import('../content.js');
    let response;
    expect(listener({ type: 'NONO_EXTRACT_ARTICLE' }, {}, value => { response = value; })).toBe(false);
    expect(response).toBeUndefined();
    expect(listener({ type: 'NONO_EXTRACT' }, {}, value => { response = value; })).toBe(true);
    expect(response.title).toBe('Bookmark page');
  });
});
