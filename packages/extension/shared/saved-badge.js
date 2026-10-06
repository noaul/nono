import { t } from './i18n.js';
import { normalizeServerUrl, serverOriginPattern } from './popup-workflow.js';

/** Opt-in: when on, the active tab's URL is looked up on the user's NoNo server. */
export const SAVED_BADGE_KEY = 'savedBadge';
const CACHE_TTL_MS = 60 * 1000;
const CACHE_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 8_000;
const BADGE = { text: '✓', color: '#167d86' };

/** URL -> { link, at }. Kept per service-worker lifetime; a save invalidates its URL. */
export function createLookupCache() {
  return new Map();
}

/**
 * Marks the toolbar icon for `tab` when its page is already bookmarked, and clears the mark when it
 * is not. Quiet on every failure: the badge is a hint, not something to report errors through.
 */
export async function refreshSavedBadge(tab, chromeApi, cache, fetchImpl = fetch, now = () => Date.now()) {
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) return null;
  const settings = await chromeApi.storage.local.get(['serverUrl', 'token', SAVED_BADGE_KEY]);
  if (!settings[SAVED_BADGE_KEY] || !settings.serverUrl || !settings.token) return null;
  let serverUrl;
  try {
    serverUrl = normalizeServerUrl(settings.serverUrl);
  } catch {
    return null;
  }
  // Pages of the NoNo server itself are never looked up.
  if (tab.url.startsWith(`${serverUrl}/`) || tab.url === serverUrl) return null;
  if (!await chromeApi.permissions.contains({ origins: [serverOriginPattern(serverUrl)] })) return null;

  let entry = cache.get(tab.url);
  if (!entry || now() - entry.at > CACHE_TTL_MS) {
    try {
      entry = { link: await lookup(fetchImpl, serverUrl, settings.token, tab.url), at: now() };
    } catch {
      return null;
    }
    cache.delete(tab.url);
    cache.set(tab.url, entry);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }

  if (entry.link) {
    const folder = (entry.link.folderPath || []).join(' / ');
    chromeApi.action.setBadgeBackgroundColor({ color: BADGE.color, tabId: tab.id });
    chromeApi.action.setBadgeText({ text: BADGE.text, tabId: tab.id });
    chromeApi.action.setTitle({ title: folder ? t('savedBadgeTitle', { name: entry.link.name, folder }) : t('savedBadgeTitleNoFolder', { name: entry.link.name }), tabId: tab.id });
  } else {
    chromeApi.action.setBadgeText({ text: '', tabId: tab.id });
    chromeApi.action.setTitle({ title: t('actionTitle'), tabId: tab.id });
  }
  return entry.link;
}

async function lookup(fetchImpl, serverUrl, token, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // POST, so the visited URL travels in the body and stays out of server access logs.
    const response = await fetchImpl(`${serverUrl}/api/admin/links/lookup`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.code !== 0) throw new Error(payload?.message || String(response.status));
    return payload.data?.saved ? payload.data.link : null;
  } finally {
    clearTimeout(timeout);
  }
}
