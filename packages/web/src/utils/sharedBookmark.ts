/** Name field limit in the bookmark editor. */
const NAME_LIMIT = 24;

export interface SharedBookmarkDraft {
  url: string;
  name: string;
}

/**
 * Reads `share_url` / `share_title` from a route query, as sent by the Android app's "share to
 * NoNo" entry. Only http(s) URLs are accepted; the name falls back to the host name.
 */
export function sharedBookmarkDraft(query: Record<string, unknown>): SharedBookmarkDraft | null {
  const raw = typeof query.share_url === 'string' ? query.share_url.trim() : '';
  if (!raw || raw.length > 4096) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const title = typeof query.share_title === 'string' ? query.share_title.replace(/\s+/g, ' ').trim() : '';
  const name = [...(title || parsed.hostname.replace(/^www\./, ''))].slice(0, NAME_LIMIT).join('');
  return { url: parsed.href, name };
}
