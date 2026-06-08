export function getFaviconUrl(url?: string | null, explicitIcon?: string | null) {
  const icon = explicitIcon?.trim();
  if (icon && /^https?:\/\//i.test(icon)) return icon;
  if (!url) return '';

  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(parsed.origin)}`;
  } catch {
    return '';
  }
}
