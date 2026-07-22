import {
  buildFolderGroups,
  buildQuickSavePayload,
  compactBookmarkName,
  findDuplicateLink,
  findFolderGroup,
  normalizeServerUrl,
  preferredFolderId,
  tokenExpiryText,
} from '../shared/popup-workflow.js';

const settingsPanel = document.querySelector('#settings');
const workflow = document.querySelector('#workflow');
const details = document.querySelector('#details');
const statusEl = document.querySelector('#status');
const tokenStatusEl = document.querySelector('#tokenStatus');
const duplicateWarningEl = document.querySelector('#duplicateWarning');
const serverUrlInput = document.querySelector('#serverUrl');
const tokenInput = document.querySelector('#token');
const nameInput = document.querySelector('#name');
const descriptionInput = document.querySelector('#description');
const categorySelect = document.querySelector('#categorySelect');
const folderSelect = document.querySelector('#folderSelect');
const saveButton = document.querySelector('#saveBookmark');
const analyzeButton = document.querySelector('#analyzeBookmark');
const toggleDetailsButton = document.querySelector('#toggleDetails');

let config = {};
let pageInfo = null;
let folders = [];
let links = [];
let folderGroups = [];
let duplicateLink = null;
let nameMode = 'auto';

document.querySelector('#settingsButton').addEventListener('click', openSettings);
document.querySelector('#closeSettings').addEventListener('click', closeSettings);
document.querySelector('#saveSettings').addEventListener('click', saveSettings);
document.querySelector('#testConnection').addEventListener('click', () => testConnection());
document.querySelector('#refreshFolders').addEventListener('click', refreshFolders);
document.querySelector('#saveBookmark').addEventListener('click', saveBookmark);
document.querySelector('#analyzeBookmark').addEventListener('click', analyzeBookmark);
document.querySelector('#toggleDetails').addEventListener('click', toggleDetails);
categorySelect.addEventListener('change', () => renderFolderOptions());
nameInput.addEventListener('input', () => {
  nameMode = 'manual';
  if (pageInfo) renderPagePreview();
});

init();

async function init() {
  config = await chrome.storage.local.get(['serverUrl', 'token', 'lastFolderId']);
  serverUrlInput.value = config.serverUrl || 'https://noaul.com';
  tokenInput.value = config.token || '';
  if (!config.serverUrl || !config.token) {
    openSettings();
    return;
  }
  if (await testConnection()) await prepareQuickSave();
  else openSettings();
}

async function saveSettings() {
  try {
    config = { ...config, serverUrl: normalizeServerUrl(serverUrlInput.value), token: tokenInput.value.trim() };
    await chrome.storage.local.set({ serverUrl: config.serverUrl, token: config.token });
    if (await testConnection()) {
      closeSettings();
      await prepareQuickSave();
    }
  } catch (error) {
    setTokenStatus(error.message || '服务地址无效。');
  }
}

async function testConnection() {
  setTokenStatus('正在连接...');
  try {
    const [session, token] = await Promise.all([
      request('/api/auth/session', undefined, 'GET'),
      request('/api/admin/tokens/current', undefined, 'GET'),
    ]);
    setTokenStatus(`${session.user?.displayName || session.user?.username || '已连接'} · ${tokenExpiryText(token)}`);
    return true;
  } catch (error) {
    setTokenStatus(error.message || '连接失败，请检查服务地址与 Token。');
    return false;
  }
}

async function prepareQuickSave() {
  workflow.classList.remove('hidden');
  setStatus('读取当前网页...');
  try {
    await Promise.all([refreshFolders(), readCurrentPage()]);
    duplicateLink = findDuplicateLink(links, pageInfo.url);
    renderDuplicateWarning();
    setStatus('选好位置后，一次点击即可收藏。');
  } catch (error) {
    setStatus(error.message || '无法读取当前网页。', 'error');
  }
}

async function refreshFolders() {
  try {
    const [folderList, linkList] = await Promise.all([
      request('/api/admin/folders', undefined, 'GET'),
      request('/api/admin/links', undefined, 'GET'),
    ]);
    folders = folderList;
    links = linkList;
    folderGroups = buildFolderGroups(folders);
    renderCategoryOptions();
  } catch (error) {
    folderGroups = [];
    renderCategoryOptions();
    throw error;
  }
}

async function readCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error('请在普通网页标签中使用快速收藏。');
  let meta = {};
  try {
    meta = await chrome.tabs.sendMessage(tab.id, { type: 'NONO_EXTRACT' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    meta = await chrome.tabs.sendMessage(tab.id, { type: 'NONO_EXTRACT' });
  }
  pageInfo = { url: tab.url, title: meta.title || tab.title || '', description: meta.description || '', content: meta.content || '', meta };
  setAutoName(pageInfo.title);
  descriptionInput.value = pageInfo.description;
  renderPagePreview();
}

async function saveBookmark() {
  if (!pageInfo) return;
  const folderId = folderSelect.value;
  if (!folderId) {
    setStatus('请先选择一个文件夹。', 'error');
    return;
  }
  setBusy(saveButton, true, '收藏中...');
  try {
    const payload = buildQuickSavePayload(pageInfo, { folderId, name: nameInput.value, nameMode, description: descriptionInput.value });
    await request('/api/admin/links', payload);
    await chrome.storage.local.set({ lastFolderId: folderId });
    config.lastFolderId = folderId;
    links = [{ ...payload, id: `saved-${Date.now()}` }, ...links];
    duplicateLink = findDuplicateLink(links, pageInfo.url);
    renderDuplicateWarning();
    setStatus('已收藏到 Nono。', 'success');
    chrome.action.setBadgeText({ text: 'OK' });
  } catch (error) {
    setStatus(error.message || '收藏失败。', 'error');
  } finally {
    setBusy(saveButton, false, '收藏此页');
  }
}

async function analyzeBookmark() {
  if (!pageInfo) return;
  setBusy(analyzeButton, true, '整理中...');
  try {
    const analysis = await request('/api/ai/analyze', pageInfo);
    setAutoName(analysis.suggestedName || nameInput.value);
    descriptionInput.value = analysis.suggestedDescription || descriptionInput.value;
    const suggestedGroup = findFolderGroup(folderGroups, analysis.suggestedFolderId);
    if (suggestedGroup) {
      categorySelect.value = String(suggestedGroup.category.id);
      renderFolderOptions(analysis.suggestedFolderId);
    }
    setStatus('AI 已补充标题、描述与建议位置。', 'success');
  } catch (error) {
    setStatus(error.message || 'AI 整理失败，仍可直接收藏。', 'error');
  } finally {
    setBusy(analyzeButton, false, 'AI 整理');
  }
}

function renderCategoryOptions() {
  categorySelect.innerHTML = '';
  for (const group of folderGroups) {
    const option = document.createElement('option');
    option.value = String(group.category.id);
    option.textContent = group.category.name;
    categorySelect.appendChild(option);
  }
  const selectedGroup = findFolderGroup(folderGroups, config.lastFolderId);
  if (selectedGroup) categorySelect.value = String(selectedGroup.category.id);
  renderFolderOptions(config.lastFolderId);
}

function renderFolderOptions(selectedFolderId = '') {
  folderSelect.innerHTML = '';
  const activeGroup = folderGroups.find((group) => String(group.category.id) === categorySelect.value) || folderGroups[0];
  for (const folder of activeGroup?.folders || []) {
    const option = document.createElement('option');
    option.value = String(folder.id);
    option.textContent = folder.name;
    folderSelect.appendChild(option);
  }
  const target = preferredFolderId([activeGroup].filter(Boolean), selectedFolderId || config.lastFolderId);
  if (target) folderSelect.value = target;
  categorySelect.disabled = !folderGroups.length;
  folderSelect.disabled = !folderSelect.options.length;
}

function renderPagePreview() {
  const host = new URL(pageInfo.url).hostname.replace(/^www\./, '');
  document.querySelector('#pageDomain').textContent = host;
  document.querySelector('#pageTitle').textContent = nameInput.value || host;
  document.querySelector('#siteInitial').textContent = host.charAt(0).toUpperCase() || 'N';
}

function setAutoName(value) {
  nameMode = 'auto';
  nameInput.value = compactBookmarkName(value, pageInfo.url);
}

function renderDuplicateWarning() {
  if (!duplicateLink) {
    duplicateWarningEl.classList.add('hidden');
    duplicateWarningEl.textContent = '';
    return;
  }
  duplicateWarningEl.textContent = `这个链接已收藏为「${duplicateLink.name}」，仍可再次保存。`;
  duplicateWarningEl.classList.remove('hidden');
}

function toggleDetails() {
  const expanded = details.classList.toggle('hidden') === false;
  toggleDetailsButton.textContent = expanded ? '收起' : '编辑';
  toggleDetailsButton.setAttribute('aria-expanded', String(expanded));
}

function openSettings() {
  settingsPanel.classList.remove('hidden');
  workflow.classList.add('hidden');
}

function closeSettings() {
  settingsPanel.classList.add('hidden');
  if (pageInfo) workflow.classList.remove('hidden');
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` ${type}` : ''}`;
}

function setTokenStatus(message) {
  tokenStatusEl.textContent = message;
}

async function request(path, body, method = 'POST') {
  const response = await fetch(`${normalizeServerUrl(config.serverUrl)}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(payload.message || '请求失败');
  return payload.data;
}
