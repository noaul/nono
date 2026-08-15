import { LOCALE_STORAGE_KEY, isLocale, localeFromUiLanguage, setLocale, t } from './shared/i18n.js';
import { buildClipPayload, normalizeServerUrl, serverOriginPattern } from './shared/popup-workflow.js';

const QUICK_SAVE_MENU_ID = 'nono-quick-save';
const OPEN_MENU_ID = 'nono-open-save';
const CLIP_PAGE_MENU_ID = 'nono-clip-page';
const CLIP_SELECTION_MENU_ID = 'nono-clip-selection';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.action.setBadgeBackgroundColor({ color: '#167d86' });
  await syncContextMenus();
});

chrome.runtime.onStartup.addListener(() => syncContextMenus());

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !(LOCALE_STORAGE_KEY in changes)) return;
  setLocale(resolveLocale(changes[LOCALE_STORAGE_KEY]?.newValue));
  void createContextMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === OPEN_MENU_ID) {
    await chrome.action.openPopup();
    return;
  }
  if (info.menuItemId === QUICK_SAVE_MENU_ID && tab) await quickSave(tab);
  if (info.menuItemId === CLIP_PAGE_MENU_ID && tab) await clipTab(tab, 'NONO_EXTRACT_ARTICLE');
  if (info.menuItemId === CLIP_SELECTION_MENU_ID && tab) await clipTab(tab, 'NONO_EXTRACT_SELECTION');
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-quick-save') await chrome.action.openPopup();
  if (command === 'quick-save-last-folder') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await quickSave(tab);
  }
  if (command === 'clip-current-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await clipTab(tab, 'NONO_EXTRACT_ARTICLE');
  }
});

async function createContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: QUICK_SAVE_MENU_ID, title: t('quickSaveMenu'), contexts: ['page'] });
  chrome.contextMenus.create({ id: OPEN_MENU_ID, title: t('pickFolderMenu'), contexts: ['page'] });
  chrome.contextMenus.create({ id: CLIP_PAGE_MENU_ID, title: t('clipPageMenu'), contexts: ['page'] });
  // Only offered when text is actually selected.
  chrome.contextMenus.create({ id: CLIP_SELECTION_MENU_ID, title: t('clipSelectionMenu'), contexts: ['selection'] });
}

async function syncContextMenus() {
  const stored = await chrome.storage.local.get([LOCALE_STORAGE_KEY]);
  setLocale(resolveLocale(stored[LOCALE_STORAGE_KEY]));
  await createContextMenus();
}

function resolveLocale(stored) {
  return isLocale(stored) ? stored : localeFromUiLanguage(chrome.i18n?.getUILanguage?.()) || 'zh';
}

async function quickSave(tab) {
  if (!tab.url || !/^https?:/.test(tab.url)) return;
  const { serverUrl, token, lastFolderId } = await chrome.storage.local.get(['serverUrl', 'token', 'lastFolderId']);
  if (!serverUrl || !token || !lastFolderId) {
    await chrome.action.openPopup();
    return;
  }
  if (!await chrome.permissions.contains({ origins: [serverOriginPattern(serverUrl)] })) {
    await chrome.action.openPopup();
    return;
  }
  try {
    const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/admin/links`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: Number(lastFolderId), name: tab.title || new URL(tab.url).hostname, nameMode: 'auto', url: tab.url, description: '' }),
    });
    const payload = await response.json();
    if (payload.code !== 0) throw new Error(payload.message || t('bookmarkFailed'));
    chrome.action.setBadgeText({ text: 'OK', tabId: tab.id });
  } catch {
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
  }
}

/**
 * Clips the tab without opening the popup, for the context menus and the keyboard shortcut.
 *
 * The content script is injected on demand rather than registered, so nothing runs in a page until
 * the user asks for it.
 */
async function clipTab(tab, extractType) {
  if (!tab.url || !/^https?:/.test(tab.url)) return;
  const { serverUrl, token } = await chrome.storage.local.get(['serverUrl', 'token']);
  if (!serverUrl || !token) {
    await chrome.action.openPopup();
    return;
  }
  if (!await chrome.permissions.contains({ origins: [serverOriginPattern(serverUrl)] })) {
    await chrome.action.openPopup();
    return;
  }

  try {
    const article = await extractFromTab(tab, extractType);
    if (!article) {
      chrome.action.setBadgeText({ text: '!', tabId: tab.id });
      return;
    }
    const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/clipper/clips`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildClipPayload(article)),
    });
    const payload = await response.json();
    if (payload.code !== 0) throw new Error(payload.message || t('clipFailed'));
    chrome.action.setBadgeText({ text: 'OK', tabId: tab.id });
  } catch {
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
  }
}

async function extractFromTab(tab, extractType) {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: extractType });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tab.id, { type: extractType });
  }
}
