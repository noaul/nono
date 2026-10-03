import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../shared/i18n.js';
import { LAST_QUICK_SAVE_KEY, quickSave, recentQuickSave } from '../shared/quick-save.js';

function fakeChrome(stored = { serverUrl: 'https://nono.example', token: 'nono_token', lastFolderId: '4' }) {
  const local = { ...stored };
  return {
    local,
    storage: {
      local: {
        get: vi.fn(async (keys) => Object.fromEntries(keys.map((key) => [key, local[key]]))),
        set: vi.fn(async (values) => Object.assign(local, values)),
      },
    },
    permissions: { contains: vi.fn(async () => true) },
    action: {
      openPopup: vi.fn(async () => undefined),
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
      setTitle: vi.fn(),
    },
  };
}

function jsonResponse(status, body) {
  return { ok: status < 400, status, json: async () => body };
}

const tab = { id: 9, url: 'https://page.example/article', title: 'Article' };

describe('one-click quick save', () => {
  beforeEach(() => setLocale('en'));

  it('marks a new bookmark as saved', async () => {
    const chrome = fakeChrome();
    const fetch = vi.fn(async () => jsonResponse(200, { code: 0, data: { id: 1, name: 'Article' }, message: '' }));

    const outcome = await quickSave(tab, chrome, fetch, () => 1000);

    expect(outcome.status).toBe('saved');
    expect(fetch).toHaveBeenCalledWith('https://nono.example/api/admin/links', expect.objectContaining({ method: 'POST' }));
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'OK', tabId: 9 });
    expect(chrome.local[LAST_QUICK_SAVE_KEY]).toMatchObject({ status: 'saved', url: tab.url, at: 1000 });
  });

  it('shows a distinct state when the page was already saved', async () => {
    const chrome = fakeChrome();
    const fetch = vi.fn(async () => jsonResponse(200, { code: 0, data: { id: 3, name: 'Old name', existing: true }, message: '' }));

    const outcome = await quickSave(tab, chrome, fetch);

    expect(outcome).toMatchObject({ status: 'existing', message: expect.stringContaining('Old name') });
    const badge = chrome.action.setBadgeText.mock.calls[0][0].text;
    expect(badge).not.toBe('OK');
    expect(badge).not.toBe('!');
    expect(chrome.action.setTitle).toHaveBeenCalledWith({ title: outcome.message, tabId: 9 });
  });

  it('surfaces the server error message instead of swallowing it', async () => {
    const chrome = fakeChrome();
    const fetch = vi.fn(async () => jsonResponse(404, { code: 404, data: null, message: 'Folder not found' }));

    const outcome = await quickSave(tab, chrome, fetch);

    expect(outcome.status).toBe('error');
    expect(outcome.message).toContain('Folder not found');
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 9 });
    expect(chrome.action.setTitle).toHaveBeenCalledWith({ title: outcome.message, tabId: 9 });
    expect(chrome.local[LAST_QUICK_SAVE_KEY]).toMatchObject({ status: 'error', message: outcome.message });
  });

  it('reports network failures and non-JSON responses', async () => {
    const offline = await quickSave(tab, fakeChrome(), vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(offline.message).toContain('Failed to fetch');

    const gateway = await quickSave(tab, fakeChrome(), vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } })));
    expect(gateway.message).toContain('502');
  });

  it('opens the popup instead of saving when it is not configured', async () => {
    const chrome = fakeChrome({});
    const fetch = vi.fn();

    await expect(quickSave(tab, chrome, fetch)).resolves.toBeNull();
    expect(chrome.action.openPopup).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('only replays a recent quick-save result in the popup', () => {
    const record = { status: 'error', message: 'Could not save: Folder not found', url: tab.url, at: 1_000 };
    expect(recentQuickSave(record, 1_000 + 60_000)).toEqual(record);
    expect(recentQuickSave(record, 1_000 + 60 * 60_000)).toBeNull();
    expect(recentQuickSave(record, 2_000, tab.url)).toEqual(record);
    expect(recentQuickSave(record, 2_000, 'https://other.example/')).toBeNull();
    expect(recentQuickSave({ status: 'weird', message: 'x', at: 1_000 }, 2_000)).toBeNull();
    expect(recentQuickSave(undefined, 2_000)).toBeNull();
  });
});
