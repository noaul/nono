const settingsPanel = document.querySelector('#settings');
const workflow = document.querySelector('#workflow');
const statusEl = document.querySelector('#status');
const resultEl = document.querySelector('#result');
const serverUrlInput = document.querySelector('#serverUrl');
const tokenInput = document.querySelector('#token');
const nameInput = document.querySelector('#name');
const descriptionInput = document.querySelector('#description');
const folderNameInput = document.querySelector('#folderName');

let config = {};
let pageInfo = null;
let analysis = null;

document.querySelector('#settingsButton').addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

document.querySelector('#saveSettings').addEventListener('click', async () => {
  config = { serverUrl: normalizeServerUrl(serverUrlInput.value), token: tokenInput.value.trim() };
  await chrome.storage.local.set(config);
  settingsPanel.classList.add('hidden');
  await analyzeCurrentTab();
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
  await analyzeCurrentTab();
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
    folderNameInput.value = analysis.suggestedFolderName || '';
    resultEl.classList.remove('hidden');
    setStatus('确认后保存到 Nono。');
  } catch (error) {
    setStatus(error.message || '分析失败');
  }
}

async function saveBookmark() {
  setStatus('保存中...');
  try {
    const payload = {
      ...pageInfo,
      folderId: analysis?.suggestedFolderId || undefined,
      folderName: folderNameInput.value.trim() || analysis?.suggestedFolderName,
      name: nameInput.value.trim(),
      description: descriptionInput.value.trim(),
    };
    await request('/api/ai/save', payload);
    setStatus('已保存。');
    chrome.action.setBadgeText({ text: 'OK' });
  } catch (error) {
    setStatus(error.message || '保存失败');
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

async function request(path, body) {
  const response = await fetch(`${normalizeServerUrl(config.serverUrl)}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(payload.message || 'Request failed');
  return payload.data;
}

function normalizeServerUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function setStatus(message) {
  statusEl.textContent = message;
}
