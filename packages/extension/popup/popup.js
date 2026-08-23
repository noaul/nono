import {
  buildClipSavePlan,
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
import { connectionDraft, persistConnectionDraft } from '../shared/settings-draft.js';

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
const clipStatusLine = document.querySelector('#clipStatusLine');
const clipSourceUrl = document.querySelector('#clipSourceUrl');
const clipTitleInput = document.querySelector('#clipTitleInput');
const clipKeywordsInput = document.querySelector('#clipKeywordsInput');
const clipSummaryInput = document.querySelector('#clipSummaryInput');
const clipTruncatedEl = document.querySelector('#clipTruncated');
const clipPreviewMeta = document.querySelector('#clipPreviewMeta');
const analyzeClipButton = document.querySelector('#analyzeClip');
const saveClipButton = document.querySelector('#saveClip');
const saveClipSelectionButton = document.querySelector('#saveClipSelection');

let config = {};
let pageInfo = null;
let folders = [];
let links = [];
let folderGroups = [];
let duplicateLink = null;
let nameMode = 'auto';
let draftSaveTimer = null;
let activeServerUrl = '';

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
analyzeClipButton.addEventListener('click', analyzeClip);
saveClipButton.addEventListener('click', () => saveClip('NONO_EXTRACT_ARTICLE'));
saveClipSelectionButton.addEventListener('click', () => saveClip('NONO_EXTRACT_SELECTION'));
categorySelect.addEventListener('change', () => renderFolderOptions());
languageSelect?.addEventListener('change', () => changeLanguage(languageSelect.value));
serverUrlInput.addEventListener('input', scheduleDraftSave);
tokenInput.addEventListener('input', scheduleDraftSave);
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
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
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
    if (await testConnection(config)) {
      activeServerUrl = config.serverUrl;
      await prepareQuickSave();
    } else openSettings();
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

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    void saveDraftFromInputs().catch(() => {
      setTokenStatus(t('settingsSaveFailed'), 'error');
    });
  }, 120);
}

async function saveDraftFromInputs() {
  clearTimeout(draftSaveTimer);
  const draft = connectionDraft(serverUrlInput.value, tokenInput.value);
  await persistConnectionDraft(chrome.storage.local, draft);
  return draft;
}

async function saveSettings() {
  setBusy(saveSettingsButton, true, t('savingSettings'));
  let candidate = null;
  let previousPattern = null;
  let nextPattern = null;
  try {
    await saveDraftFromInputs();
    candidate = connectionFromInputs();
    previousPattern = activeServerUrl ? serverOriginPattern(activeServerUrl) : null;
    nextPattern = serverOriginPattern(candidate.serverUrl);
    const granted = await requestServerPermission(candidate.serverUrl);
    if (!granted) throw new Error(t('permissionDenied'));
    if (!await testConnection(candidate)) return;

    config = candidate;
    activeServerUrl = candidate.serverUrl;
    await chrome.storage.local.set({ serverUrl: config.serverUrl, token: config.token });
    if (previousPattern && previousPattern !== nextPattern) {
      await chrome.permissions.remove({ origins: [previousPattern] });
    }
    closeSettings();
    await prepareQuickSave();
  } catch (error) {
    setTokenStatus(error.message || t('invalidServerUrl'), 'error');
  } finally {
    setBusy(saveSettingsButton, false, t('saveAndStart'));
  }
}

async function testConnectionFromInputs() {
  setBusy(testConnectionButton, true, t('connecting'));
  try {
    await saveDraftFromInputs();
    const candidate = connectionFromInputs();
    const granted = await requestServerPermission(candidate.serverUrl);
    if (!granted) throw new Error(t('permissionDenied'));
    await testConnection(candidate);
  } catch (error) {
    setTokenStatus(error.message || t('connectFailed'), 'error');
  } finally {
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
    setStatus(folderGroups.length ? '' : t('noFolders'), folderGroups.length ? '' : 'error');
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
  statusLine.className = `status-line${type ? ` ${type}` : ''}${message ? '' : ' hidden'}`;
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
    renderClipEditor(clipArticle);
  } catch (error) {
    clipStatusLine.textContent = error.message || t('clipFailed');
  }
}

function renderClipEditor(article) {
  if (!article) return;
  clipStatusLine.textContent = article.domain || '';
  clipSourceUrl.href = article.url || pageInfo?.url || '';
  clipSourceUrl.textContent = article.url || pageInfo?.url || '';
  clipSourceUrl.title = article.url || pageInfo?.url || '';
  clipTitleInput.value = article.title || pageInfo?.title || '';
  clipKeywordsInput.value = '';
  clipSummaryInput.value = article.description
    || String(article.contentMd || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  const content = String(article.contentMd || '').trim();
  const words = content ? content.split(/\s+/).filter(Boolean).length : 0;
  const characters = content.length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  clipPreviewMeta.textContent = t('clipPreviewStats', { words, characters, minutes });
  clipTruncatedEl.classList.toggle('hidden', !article.contentTruncated);
}

async function analyzeClip() {
  setBusy(analyzeClipButton, true, t('analyzingClip'));
  try {
    if (!clipArticle) clipArticle = await extractFromActiveTab('NONO_EXTRACT_ARTICLE');
    const analysis = await request('/api/ai/analyze', {
      url: clipArticle.url,
      title: clipTitleInput.value || clipArticle.title || '',
      content: String(clipArticle.contentMd || '').slice(0, 5000),
      meta: clipArticle.sourceMeta || {},
      purpose: 'clip',
    });
    clipTitleInput.value = analysis.suggestedName || clipTitleInput.value;
    clipKeywordsInput.value = Array.isArray(analysis.suggestedKeywords)
      ? analysis.suggestedKeywords.join(', ')
      : clipKeywordsInput.value;
    clipSummaryInput.value = analysis.suggestedDescription || clipSummaryInput.value;
    setStatus(t('clipAnalyzed'), 'success');
  } catch (error) {
    setStatus(error.message || t('clipAnalyzeFailed'), 'error');
  } finally {
    setBusy(analyzeClipButton, false, t('aiAnalyzeClip'));
  }
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
      renderClipEditor(article);
    }
    const plan = buildClipSavePlan(article, {
      title: clipTitleInput.value,
      keywords: clipKeywordsInput.value,
      summary: clipSummaryInput.value,
    });
    const created = await request('/api/clipper/clips', plan.payload);
    if (plan.tagNames.length > 0) {
      const tags = await Promise.all(plan.tagNames.map((name) => request('/api/clipper/tags', { name })));
      const tagIds = [...new Set(tags.map((tag) => Number(tag?.id)).filter(Number.isInteger))];
      if (tagIds.length > 0) await request(`/api/clipper/clips/${created.id}/tags`, { tagIds }, 'PUT');
    }
    setStatus(t('clipSaved'), 'success');
    chrome.action.setBadgeText({ text: 'OK' });
  } catch (error) {
    setStatus(clipErrorMessage(error), 'error');
  } finally {
    setBusy(button, false, label);
  }
}
