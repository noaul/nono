import { normalizeServerUrl } from './shared/popup-workflow.js';

const QUICK_SAVE_MENU_ID = 'nono-quick-save';
const OPEN_MENU_ID = 'nono-open-save';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.action.setBadgeBackgroundColor({ color: '#5c67e8' });
  await createContextMenus();
});

chrome.runtime.onStartup.addListener(() => createContextMenus());

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
  chrome.contextMenus.create({ id: QUICK_SAVE_MENU_ID, title: '保存到 Nono（上次文件夹）', contexts: ['page'] });
  chrome.contextMenus.create({ id: OPEN_MENU_ID, title: '选择文件夹后保存到 Nono', contexts: ['page'] });
}

async function quickSave(tab) {
  if (!tab.url || !/^https?:/.test(tab.url)) return;
  const { serverUrl, token, lastFolderId } = await chrome.storage.local.get(['serverUrl', 'token', 'lastFolderId']);
  if (!serverUrl || !token || !lastFolderId) {
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
    if (payload.code !== 0) throw new Error(payload.message || '收藏失败');
    chrome.action.setBadgeText({ text: 'OK', tabId: tab.id });
  } catch {
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
  }
}
