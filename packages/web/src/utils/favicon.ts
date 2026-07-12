export function getFaviconUrl(url?: string | null, explicitIcon?: string | null) {
  const icon = explicitIcon?.trim();
  if (icon && /^https?:\/\//i.test(icon)) return icon;
  if (!url) return '';

  try {
    const parsed = new URL(url);
    if (!parsed.hostname || !parsed.hostname.includes('.')) return '';
    return `/api/favicon?domain=${encodeURIComponent(parsed.hostname)}`;
  } catch {
    return '';
  }
}
