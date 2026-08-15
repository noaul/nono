import {
  buildClipPayload,
  clipErrorMessage,
  buildFolderGroups,
  buildQuickSavePayload,
  buildUpdateBookmarkPayload,
  compactBookmarkName,
  findDuplicateLink,
  findFolderGroup,
  normalizeServerUrl,
  preferredFolderId,
  serverOriginPattern,
  tokenExpiryText,
} from '../shared/popup-workflow.js';
import { LOCALE_STORAGE_KEY, getLocale, isLocale, localeFromUiLanguage, setLocale, t } from '../shared/i18n.js';

const languageSelect = document.querySelector('#languageSelect');
const settingsPanel = document.querySelector('#settings');
const workflow = document.querySelector('#workflow');
const details = document.querySelector('#details');
const statusEl = document.querySelector('#status');
const statusLine = document.querySelector('.status-line');
const tokenStatusEl = document.querySelector('#tokenStatus');
const connectionNote = document.querySelector('.connection-note');
const duplicateWarningEl = document.querySelector('#duplicateWarning');
const duplicateMessageEl = document.querySelector('#duplicateMessage');
const duplicateActionButton = document.querySelector('#duplicateAction');
const serverUrlInput = document.querySelector('#serverUrl');
const tokenInput = document.querySelector('#token');
const nameInput = document.querySelector('#name');
const descriptionInput = document.querySelector('#description');
const categorySelect = document.querySelector('#categorySelect');
const folderSelect = document.querySelector('#folderSelect');
const saveButton = document.querySelector('#saveBookmark');
const saveSettingsButton = document.querySelector('#saveSettings');
const testConnectionButton = document.querySelector('#testConnection');
const analyzeButton = document.querySelector('#analyzeBookmark');
const refreshFoldersButton = document.querySelector('#refreshFolders');
const toggleDetailsButton = document.querySelector('#toggleDetails');
const versionLabel = document.querySelector('#versionLabel');
const modeBookmarkButton = document.querySelector('#modeBookmark');
const modeClipButton = document.querySelector('#modeClip');
const bookmarkPanel = document.querySelector('#bookmarkPanel');
const clipPanel = document.querySelector('#clipPanel');
const clipPreviewTitle = document.querySelector('#clipTitle');
const clipPreviewMeta = document.querySelector('#clipMeta');
const clipPreviewExcerpt = document.querySelector('#clipExcerpt');
const clipStatusLine = document.querySelector('#clipStatusLine');
const clipTruncatedEl = document.querySelector('#clipTruncated');
const saveClipButton = document.querySelector('#saveClip');
const saveClipSelectionButton = document.querySelector('#saveClipSelection');

let config = {};
let pageInfo = null;
let folders = [];
let links = [];
let folderGroups = [];
let duplicateLink = null;
let nameMode = 'auto';

document.querySelector('#settingsButton').addEventListener('click', openSettings);
document.querySelector('#closeSettings').addEventListener('click', closeSettings);
saveSettingsButton.addEventListener('click', saveSettings);
testConnectionButton.addEventListener('click', testConnectionFromInputs);
refreshFoldersButton.addEventListener('click', refreshFoldersFromButton);
saveButton.addEventListener('click', saveBookmark);
duplicateActionButton.addEventListener('click', updateDuplicateBookmark);
analyzeButton.addEventListener('click', analyzeBookmark);
toggleDetailsButton.addEventListener('click', toggleDetails);
modeBookmarkButton.addEventListener('click', () => setMode('bookmark'));
modeClipButton.addEventListener('click', () => setMode('clip'));
saveClipButton.addEventListener('click', () => saveClip('NONO_EXTRACT_ARTICLE'));
saveClipSelectionButton.addEventListener('click', () => saveClip('NONO_EXTRACT_SELECTION'));
categorySelect.addEventListener('change', () => renderFolderOptions());
languageSelect?.addEventListener('change', () => changeLanguage(languageSelect.value));
nameInput.addEventListener('input', () => {
  nameMode = 'manual';
  if (pageInfo) renderPagePreview();
});

versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
applyTranslations();
init();

function applyTranslations() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  document.documentElement.lang = getLocale() === 'zh' ? 'zh-CN' : 'en';
  if (languageSelect) languageSelect.value = getLocale();
  renderDetailsLabel();
  renderDuplicateWarning();
}

async function changeLanguage(next) {
  setLocale(next);
  try {
    await chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: getLocale() });
  } catch {
    // The popup still switches for this session when storage is unavailable.
  }
  applyTranslations();
}

async function init() {
  try {
    config = await chrome.storage.local.get(['serverUrl', 'token', 'lastFolderId', LOCALE_STORAGE_KEY]);
    const stored = config[LOCALE_STORAGE_KEY];
    setLocale(isLocale(stored) ? stored : localeFromUiLanguage(chrome.i18n?.getUILanguage?.()) || 'zh');
    applyTranslations();
    serverUrlInput.value = config.serverUrl || 'http://localhost:3000';
    tokenInput.value = config.token || '';

    if (!config.serverUrl || !config.token) {
      openSettings();
      return;
    }
    if (!await hasServerPermission(config.serverUrl)) {
      openSettings();
      setTokenStatus(t('permissionRequired'), 'error');
      return;
    }
    if (await testConnection(config)) await prepareQuickSave();
    else openSettings();
  } catch (error) {
    openSettings();
    setTokenStatus(error.message || t('connectFailed'), 'error');
  }
}

function connectionFromInputs() {
  const token = tokenInput.value.trim();
  if (!token) throw new Error(t('needToken'));
  return { ...config, serverUrl: normalizeServerUrl(serverUrlInput.value), token };
}

async function saveSettings() {
  setBusy(saveSettingsButton, true, t('savingSettings'));
  let candidate = null;
  let previousPattern = null;
  let nextPattern = null;
  try {
    candidate = connectionFromInputs();
    previousPattern = config.serverUrl ? serverOriginPattern(config.serverUrl) : null;
    nextPattern = serverOriginPattern(candidate.serverUrl);
    const granted = await requestServerPermission(candidate.serverUrl);
    if (!granted) throw new Error(t('permissionDenied'));
    if (!await testConnection(candidate)) {
      if (nextPattern !== previousPattern) await chrome.permissions.remove({ origins: [nextPattern] });
      return;
    }

    config = candidate;
    await chrome.storage.local.set({ serverUrl: config.serverUrl, token: config.token });
    if (previousPattern && previousPattern !== nextPattern) {
      await chrome.permissions.remove({ origins: [previousPattern] });
    }
    closeSettings();
    await prepareQuickSave();
  } catch (error) {
    if (nextPattern && nextPattern !== previousPattern) {
      await chrome.permissions.remove({ origins: [nextPattern] }).catch(() => false);
    }
    setTokenStatus(error.message || t('invalidServerUrl'), 'error');
  } finally {
    setBusy(saveSettingsButton, false, t('saveAndStart'));
  }
}

async function testConnectionFromInputs() {
  setBusy(testConnectionButton, true, t('connecting'));
  let temporaryPattern = null;
  try {
    const candidate = connectionFromInputs();
    const savedPattern = config.serverUrl ? serverOriginPattern(config.serverUrl) : null;
    const candidatePattern = serverOriginPattern(candidate.serverUrl);
    if (candidatePattern !== savedPattern) temporaryPattern = candidatePattern;
    const granted = await requestServerPermission(candidate.serverUrl);
    if (!granted) throw new Error(t('permissionDenied'));
    await testConnection(candidate);
  } catch (error) {
    setTokenStatus(error.message || t('connectFailed'), 'error');
  } finally {
    if (temporaryPattern) await chrome.permissions.remove({ origins: [temporaryPattern] }).catch(() => false);
    setBusy(testConnectionButton, false, t('testConnection'));
  }
}

async function testConnection(connection = config) {
  setTokenStatus(t('connecting'));
  try {
    const [session, token] = await Promise.all([
      request('/api/auth/session', undefined, 'GET', connection),
      request('/api/admin/tokens/current', undefined, 'GET', connection),
    ]);
    setTokenStatus(`${session.user?.displayName || session.user?.username || t('connected')} · ${tokenExpiryText(token)}`, 'success');
    return true;
  } catch (error) {
    setTokenStatus(error.message || t('connectFailed'), 'error');
    return false;
  }
}

async function prepareQuickSave() {
  workflow.classList.remove('hidden');
  settingsPanel.classList.add('hidden');
  setStatus(t('readingPage'));
  try {
    await Promise.all([refreshFolders(), readCurrentPage()]);
    duplicateLink = findDuplicateLink(links, pageInfo.url);
    renderDuplicateWarning();
    setStatus(folderGroups.length ? t('pickThenSave') : t('noFolders'), folderGroups.length ? '' : 'error');
  } catch (error) {
    setStatus(error.message || t('cannotReadPage'), 'error');
  }
}

async function refreshFoldersFromButton() {
  refreshFoldersButton.disabled = true;
  try {
    await refreshFolders();
    duplicateLink = pageInfo ? findDuplicateLink(links, pageInfo.url) : null;
    renderDuplicateWarning();
    setStatus(folderGroups.length ? t('foldersRefreshed') : t('noFolders'), folderGroups.length ? 'success' : 'error');
  } catch (error) {
    setStatus(error.message || t('refreshFailed'), 'error');
  } finally {
    refreshFoldersButton.disabled = false;
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
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error(t('useOnNormalTab'));
  let meta = {};
  try {
    meta = await chrome.tabs.sendMessage(tab.id, { type: 'NONO_EXTRACT' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    meta = await chrome.tabs.sendMessage(tab.id, { type: 'NONO_EXTRACT' });
  }
  pageInfo = {
    url: tab.url,
    title: meta.title || tab.title || '',
    description: meta.description || '',
    content: meta.content || '',
    meta,
  };
  setAutoName(pageInfo.title);
  descriptionInput.value = pageInfo.description;
  renderPagePreview();
}

async function saveBookmark() {
  if (!pageInfo) return;
  const folderId = folderSelect.value;
  if (!folderId) {
    setStatus(t('pickFolderFirst'), 'error');
    return;
  }
  setBusy(saveButton, true, t('saving'));
  try {
    const payload = buildQuickSavePayload(pageInfo, { folderId, name: nameInput.value, nameMode, description: descriptionInput.value });
    const created = await request('/api/admin/links', payload);
    await rememberFolder(folderId);
    links = [created, ...links];
    duplicateLink = findDuplicateLink(links, pageInfo.url);
    renderDuplicateWarning();
    setStatus(t('saved'), 'success');
    chrome.action.setBadgeText({ text: 'OK' });
  } catch (error) {
    setStatus(error.message || t('saveFailed'), 'error');
  } finally {
    setBusy(saveButton, false, duplicateLink ? t('saveAnotherCopy') : t('saveThisPage'));
  }
}

async function updateDuplicateBookmark() {
  if (!pageInfo || !duplicateLink) return;
  const folderId = folderSelect.value;
  if (!folderId) {
    setStatus(t('pickFolderFirst'), 'error');
    return;
  }
  setBusy(duplicateActionButton, true, t('updating'));
  try {
    const payload = buildUpdateBookmarkPayload(pageInfo, { folderId, name: nameInput.value, description: descriptionInput.value });
    const updated = await request(`/api/admin/links/${duplicateLink.id}`, payload, 'PUT');
    links = links.map((link) => String(link.id) === String(updated.id) ? updated : link);
    duplicateLink = updated;
    await rememberFolder(folderId);
    renderDuplicateWarning();
    setStatus(t('updatedExisting'), 'success');
    chrome.action.setBadgeText({ text: 'OK' });
  } catch (error) {
    setStatus(error.message || t('updateFailed'), 'error');
  } finally {
    setBusy(duplicateActionButton, false, t('updateExisting'));
  }
}

async function analyzeBookmark() {
  if (!pageInfo) return;
  setBusy(analyzeButton, true, t('tidying'));
  try {
    const analysis = await request('/api/ai/analyze', pageInfo);
    setAutoName(analysis.suggestedName || nameInput.value);
    descriptionInput.value = analysis.suggestedDescription || descriptionInput.value;
    const suggestedGroup = findFolderGroup(folderGroups, analysis.suggestedFolderId);
    if (suggestedGroup) {
      categorySelect.value = String(suggestedGroup.category.id);
      renderFolderOptions(analysis.suggestedFolderId);
    }
    setStatus(t('tidied'), 'success');
  } catch (error) {
    setStatus(error.message || t('tidyFailed'), 'error');
  } finally {
    setBusy(analyzeButton, false, t('aiTidy'));
  }
}

function renderCategoryOptions() {
  categorySelect.innerHTML = '';
  if (!folderGroups.length) {
    addEmptyOption(categorySelect, t('noFoldersOption'));
    addEmptyOption(folderSelect, t('noFoldersOption'));
    categorySelect.disabled = true;
    folderSelect.disabled = true;
    saveButton.disabled = true;
    return;
  }
  for (const group of folderGroups) {
    const option = document.createElement('option');
    option.value = String(group.category.id);
    option.textContent = group.category.name;
    categorySelect.appendChild(option);
  }
  const selectedGroup = findFolderGroup(folderGroups, config.lastFolderId);
  if (selectedGroup) categorySelect.value = String(selectedGroup.category.id);
  categorySelect.disabled = false;
  saveButton.disabled = false;
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
  folderSelect.disabled = !folderSelect.options.length;
  saveButton.disabled = !folderSelect.options.length;
}

function addEmptyOption(select, label) {
  select.innerHTML = '';
  const option = document.createElement('option');
  option.value = '';
  option.textContent = label;
  select.appendChild(option);
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
  if (!duplicateWarningEl || !saveButton) return;
  if (!duplicateLink) {
    duplicateWarningEl.classList.add('hidden');
    duplicateMessageEl.textContent = '';
    if (!saveButton.disabled) saveButton.textContent = t('saveThisPage');
    return;
  }
  duplicateMessageEl.textContent = t('duplicateWarning', { name: duplicateLink.name });
  duplicateWarningEl.classList.remove('hidden');
  if (!saveButton.disabled) saveButton.textContent = t('saveAnotherCopy');
}

function toggleDetails() {
  details.classList.toggle('hidden');
  renderDetailsLabel();
}

function renderDetailsLabel() {
  if (!details || !toggleDetailsButton) return;
  const expanded = !details.classList.contains('hidden');
  toggleDetailsButton.textContent = expanded ? t('collapse') : t('edit');
  toggleDetailsButton.setAttribute('aria-expanded', String(expanded));
}

function openSettings() {
  settingsPanel.classList.remove('hidden');
  workflow.classList.add('hidden');
}

function closeSettings() {
  if (!pageInfo) {
    window.close();
    return;
  }
  settingsPanel.classList.add('hidden');
  workflow.classList.remove('hidden');
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusLine.className = `status-line${type ? ` ${type}` : ''}`;
}

function setTokenStatus(message, type = '') {
  tokenStatusEl.textContent = message;
  connectionNote.className = `connection-note${type ? ` ${type}` : ''}`;
}

async function rememberFolder(folderId) {
  await chrome.storage.local.set({ lastFolderId: folderId });
  config.lastFolderId = folderId;
}

async function hasServerPermission(serverUrl) {
  return chrome.permissions.contains({ origins: [serverOriginPattern(serverUrl)] });
}

async function requestServerPermission(serverUrl) {
  return chrome.permissions.request({ origins: [serverOriginPattern(serverUrl)] });
}

async function request(path, body, method = 'POST', connection = config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${normalizeServerUrl(connection.serverUrl)}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${connection.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.code !== 0) {
      // Carry the status so callers can tell an insufficient token scope from a generic failure.
      throw Object.assign(
        new Error(payload?.message || `${t('requestFailed')} (${response.status})`),
        { status: response.status },
      );
    }
    return payload.data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(t('requestTimedOut'));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


/**
 * Clip mode.
 *
 * The article is parsed only once the user switches into clip mode or invokes a clip command.
 * Running the full extractor on every popup open would parse pages nobody intends to clip.
 */
let clipMode = 'bookmark';
let clipArticle = null;

function setMode(mode) {
  clipMode = mode;
  const clipping = mode === 'clip';
  modeBookmarkButton.classList.toggle('is-active', !clipping);
  modeClipButton.classList.toggle('is-active', clipping);
  modeBookmarkButton.setAttribute('aria-selected', String(!clipping));
  modeClipButton.setAttribute('aria-selected', String(clipping));
  bookmarkPanel.classList.toggle('hidden', clipping);
  clipPanel.classList.toggle('hidden', !clipping);
  if (clipping && !clipArticle) void loadClipPreview();
}

async function extractFromActiveTab(extractType) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error(t('useOnNormalTab'));
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: extractType });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tab.id, { type: extractType });
  }
}

async function loadClipPreview() {
  clipStatusLine.textContent = t('readingArticle');
  try {
    clipArticle = await extractFromActiveTab('NONO_EXTRACT_ARTICLE');
    renderClipPreview(clipArticle);
  } catch (error) {
    clipStatusLine.textContent = error.message || t('clipFailed');
  }
}

function renderClipPreview(article) {
  if (!article) return;
  clipStatusLine.textContent = article.domain || '';
  clipPreviewTitle.textContent = article.title || '';
  clipPreviewMeta.textContent = [article.siteName, article.author, t('clipWords', { 1: article.wordCount || 0 })]
    .filter(Boolean)
    .join(' · ');
  clipPreviewExcerpt.textContent = String(article.contentMd || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  clipTruncatedEl.classList.toggle('hidden', !article.contentTruncated);
}

async function saveClip(extractType) {
  const button = extractType === 'NONO_EXTRACT_SELECTION' ? saveClipSelectionButton : saveClipButton;
  const label = extractType === 'NONO_EXTRACT_SELECTION' ? t('clipSelection') : t('clipThisPage');
  setBusy(button, true, t('clipping'));
  try {
    const article = extractType === 'NONO_EXTRACT_ARTICLE' && clipArticle
      ? clipArticle
      : await extractFromActiveTab(extractType);
    if (!article) throw new Error(t('noSelection'));
    if (extractType === 'NONO_EXTRACT_ARTICLE') {
      clipArticle = article;
      renderClipPreview(article);
    }
    await request('/api/clipper/clips', buildClipPayload(article));
    setStatus(t('clipSaved'), 'success');
    chrome.action.setBadgeText({ text: 'OK' });
  } catch (error) {
    setStatus(clipErrorMessage(error), 'error');
  } finally {
    setBusy(button, false, label);
  }
}
