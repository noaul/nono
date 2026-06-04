import { buildSavePayload, findDuplicateLink, healthStatusText, normalizeServerUrl, tokenExpiryText } from '../shared/popup-workflow.js';

const settingsPanel = document.querySelector('#settings');
const workflow = document.querySelector('#workflow');
const statusEl = document.querySelector('#status');
const resultEl = document.querySelector('#result');
const tokenStatusEl = document.querySelector('#tokenStatus');
const duplicateWarningEl = document.querySelector('#duplicateWarning');
const healthStatusEl = document.querySelector('#healthStatus');
const serverUrlInput = document.querySelector('#serverUrl');
const tokenInput = document.querySelector('#token');
const nameInput = document.querySelector('#name');
const descriptionInput = document.querySelector('#description');
const folderSelect = document.querySelector('#folderSelect');
const folderNameInput = document.querySelector('#folderName');

let config = {};
let pageInfo = null;
let analysis = null;
let folders = [];
let links = [];
let duplicateLink = null;

document.querySelector('#settingsButton').addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

document.querySelector('#saveSettings').addEventListener('click', async () => {
  config = { serverUrl: normalizeServerUrl(serverUrlInput.value), token: tokenInput.value.trim() };
  await chrome.storage.local.set(config);
  const connected = await testConnection();
  if (connected) {
    settingsPanel.classList.add('hidden');
    await analyzeCurrentTab();
  }
});

document.querySelector('#testConnection').addEventListener('click', async () => {
  config = { serverUrl: normalizeServerUrl(serverUrlInput.value), token: tokenInput.value.trim() };
  await testConnection();
});

document.querySelector('#saveBookmark').addEventListener('click', async () => {
  await saveBookmark();
});

init();

async function init() {
  config = await chrome.storage.local.get(['serverUrl', 'token']);
  serverUrlInput.value = config.serverUrl || 'http://127.0.0.1:3000';
  tokenInput.value = config.token || '';
  if (!config.serverUrl || !config.token) {
    settingsPanel.classList.remove('hidden');
    workflow.classList.add('hidden');
    return;
  }
  const connected = await testConnection();
  if (!connected) {
    settingsPanel.classList.remove('hidden');
    workflow.classList.add('hidden');
    return;
  }
  await analyzeCurrentTab();
}

async function testConnection() {
  setTokenStatus('测试连接中...');
  try {
    const [session, token, folderList, linkList] = await Promise.all([
      request('/api/auth/session', undefined, 'GET'),
      request('/api/admin/tokens/current', undefined, 'GET'),
      request('/api/admin/folders', undefined, 'GET'),
      request('/api/admin/links', undefined, 'GET'),
    ]);
    folders = folderList;
    links = linkList;
    renderFolders();
    setTokenStatus(`${session.user?.displayName || session.user?.username || '已连接'} · ${tokenExpiryText(token)}`);
    return true;
  } catch (error) {
    folders = [];
    links = [];
    renderFolders();
    setTokenStatus(error.message || '连接失败，Token 可能无效或已过期。');
    return false;
  }
}

async function analyzeCurrentTab() {
  workflow.classList.remove('hidden');
  resultEl.classList.add('hidden');
  setStatus('分析中...');
  try {
    pageInfo = await getCurrentPageInfo();
    analysis = await request('/api/ai/analyze', pageInfo);
    nameInput.value = analysis.suggestedName || pageInfo.title || '';
    descriptionInput.value = analysis.suggestedDescription || pageInfo.description || '';
    selectSuggestedFolder();
    folderNameInput.value = '';
    duplicateLink = findDuplicateLink(links, pageInfo.url);
    renderDuplicateWarning();
    healthStatusEl.classList.add('hidden');
    resultEl.classList.remove('hidden');
    setStatus('确认后保存到 Nono。');
  } catch (error) {
    setStatus(error.message || '分析失败');
  }
}

async function saveBookmark() {
  setStatus('保存中...');
  try {
    renderDuplicateWarning();
    const payload = buildSavePayload(pageInfo, analysis, {
      folderId: folderSelect.value,
      folderName: folderNameInput.value,
      name: nameInput.value,
      description: descriptionInput.value,
    });
    const saved = await request('/api/ai/save', payload);
    links = [saved, ...links];
    await checkSavedLinkHealth(saved.id);
    setStatus(duplicateLink ? '已保存；注意这个 URL 之前已存在。' : '已保存。');
    chrome.action.setBadgeText({ text: 'OK' });
  } catch (error) {
    setStatus(error.message || '保存失败');
  }
}

async function checkSavedLinkHealth(id) {
  try {
    const result = await request('/api/admin/links/health-check', { ids: [id] });
    healthStatusEl.textContent = healthStatusText(result.results?.[0]);
    healthStatusEl.classList.remove('hidden');
  } catch (error) {
    healthStatusEl.textContent = error.message || '链接健康检查失败';
    healthStatusEl.classList.remove('hidden');
  }
}

async function getCurrentPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('无法读取当前标签页');
  let meta = {};
  try {
    meta = await chrome.tabs.sendMessage(tab.id, { type: 'NONO_EXTRACT' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    meta = await chrome.tabs.sendMessage(tab.id, { type: 'NONO_EXTRACT' });
  }
  return {
    url: tab.url,
    title: meta.title || tab.title,
    content: meta.content || '',
    meta,
  };
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
  if (payload.code !== 0) throw new Error(payload.message || 'Request failed');
  return payload.data;
}

function renderFolders() {
  folderSelect.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = folders.length ? '自动选择' : '没有可选文件夹';
  folderSelect.appendChild(empty);
  for (const folder of folders) {
    const option = document.createElement('option');
    option.value = String(folder.id);
    option.textContent = folder.name;
    folderSelect.appendChild(option);
  }
}

function selectSuggestedFolder() {
  renderFolders();
  const suggestedId = String(analysis?.suggestedFolderId || '');
  if (suggestedId && folders.some((folder) => String(folder.id) === suggestedId)) {
    folderSelect.value = suggestedId;
  } else if (folders[0]) {
    folderSelect.value = String(folders[0].id);
  }
}

function renderDuplicateWarning() {
  if (!duplicateLink) {
    duplicateWarningEl.classList.add('hidden');
    duplicateWarningEl.textContent = '';
    return;
  }
  duplicateWarningEl.textContent = `提示：这个 URL 已存在于「${duplicateLink.name}」，仍可继续保存。`;
  duplicateWarningEl.classList.remove('hidden');
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setTokenStatus(message) {
  tokenStatusEl.textContent = message;
}
