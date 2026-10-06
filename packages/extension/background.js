import { LOCALE_STORAGE_KEY, isLocale, localeFromUiLanguage, setLocale, t } from './shared/i18n.js';
import { quickSave as runQuickSave } from './shared/quick-save.js';
import { SAVED_BADGE_KEY, createLookupCache, refreshSavedBadge } from './shared/saved-badge.js';

const QUICK_SAVE_MENU_ID = 'nono-quick-save';
const OPEN_MENU_ID = 'nono-open-save';
const lookupCache = createLookupCache();

chrome.runtime.onInstalled.addListener(async () => {
  chrome.action.setBadgeBackgroundColor({ color: '#167d86' });
  await syncContextMenus();
});

chrome.runtime.onStartup.addListener(() => syncContextMenus());

// Tab events only carry URLs once the optional "tabs" permission is granted (the badge setting).
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) await updateSavedBadge(tab);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) await updateSavedBadge(tab);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && (SAVED_BADGE_KEY in changes || 'serverUrl' in changes || 'token' in changes)) lookupCache.clear();
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
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-quick-save') await chrome.action.openPopup();
  if (command === 'quick-save-last-folder') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await quickSave(tab);
  }
});

async function createContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: QUICK_SAVE_MENU_ID, title: t('quickSaveMenu'), contexts: ['page'] });
  chrome.contextMenus.create({ id: OPEN_MENU_ID, title: t('pickFolderMenu'), contexts: ['page'] });
}

async function syncContextMenus() {
  const stored = await chrome.storage.local.get([LOCALE_STORAGE_KEY]);
  setLocale(resolveLocale(stored[LOCALE_STORAGE_KEY]));
  await createContextMenus();
}

function resolveLocale(stored) {
  return isLocale(stored) ? stored : localeFromUiLanguage(chrome.i18n?.getUILanguage?.()) || 'zh';
}

// The badge says which way it went; the tooltip and the next popup open say why.
async function quickSave(tab) {
  // A woken service worker has not run onStartup, so pick the saved locale up again.
  const stored = await chrome.storage.local.get([LOCALE_STORAGE_KEY]);
  setLocale(resolveLocale(stored[LOCALE_STORAGE_KEY]));
  await runQuickSave(tab, chrome);
  lookupCache.delete(tab.url);
}

async function updateSavedBadge(tab) {
  const stored = await chrome.storage.local.get([LOCALE_STORAGE_KEY]);
  setLocale(resolveLocale(stored[LOCALE_STORAGE_KEY]));
  await refreshSavedBadge(tab, chrome, lookupCache).catch(() => null);
}
