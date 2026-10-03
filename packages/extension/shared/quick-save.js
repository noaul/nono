import { t } from './i18n.js';
import { normalizeServerUrl, serverOriginPattern } from './popup-workflow.js';

// The last one-click result, so the popup can explain a "!" badge the next time it opens.
export const LAST_QUICK_SAVE_KEY = 'lastQuickSave';
const REPLAY_WINDOW_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

const BADGES = {
  saved: { text: 'OK', color: '#167d86' },
  existing: { text: '✓', color: '#b7791f' },
  error: { text: '!', color: '#c53030' },
};

/**
 * Saves the tab into the last-used folder. `chromeApi` and `fetchImpl` are injected so the
 * service worker logic can be tested without a browser.
 */
export async function quickSave(tab, chromeApi, fetchImpl = fetch, now = () => Date.now()) {
  if (!tab?.url || !/^https?:/.test(tab.url)) return null;
  const { serverUrl, token, lastFolderId } = await chromeApi.storage.local.get(['serverUrl', 'token', 'lastFolderId']);
  if (!serverUrl || !token || !lastFolderId || !await chromeApi.permissions.contains({ origins: [serverOriginPattern(serverUrl)] })) {
    await chromeApi.action.openPopup();
    return null;
  }

  let outcome;
  try {
    const link = await postBookmark(fetchImpl, serverUrl, token, {
      folderId: Number(lastFolderId),
      name: tab.title || new URL(tab.url).hostname,
      nameMode: 'auto',
      url: tab.url,
      description: '',
    });
    outcome = link?.existing
      ? { status: 'existing', message: t('alreadySaved', { name: link.name || tab.title || tab.url }) }
      : { status: 'saved', message: t('saved') };
  } catch (error) {
    outcome = { status: 'error', message: `${t('bookmarkFailed')}: ${error?.message || t('requestFailed')}` };
  }

  const badge = BADGES[outcome.status];
  chromeApi.action.setBadgeBackgroundColor({ color: badge.color, tabId: tab.id });
  chromeApi.action.setBadgeText({ text: badge.text, tabId: tab.id });
  chromeApi.action.setTitle({ title: outcome.message, tabId: tab.id });
  try {
    await chromeApi.storage.local.set({ [LAST_QUICK_SAVE_KEY]: { ...outcome, url: tab.url, at: now() } });
  } catch {
    // The badge and tooltip already carry the result.
  }
  return outcome;
}

/** The stored result when it is recent, and for `url` if given, so it is about what the user just did. */
export function recentQuickSave(record, now = Date.now(), url = null) {
  if (!record || !BADGES[record.status] || typeof record.message !== 'string') return null;
  if (url && record.url !== url) return null;
  const age = now - Number(record.at);
  return age >= 0 && age <= REPLAY_WINDOW_MS ? record : null;
}

async function postBookmark(fetchImpl, serverUrl, token, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${normalizeServerUrl(serverUrl)}/api/admin/links`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.code !== 0) throw new Error(payload?.message || `${t('requestFailed')} (${response.status})`);
    return payload.data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(t('requestTimedOut'));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
