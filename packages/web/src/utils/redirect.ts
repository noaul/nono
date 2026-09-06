export function resolveInternalRedirect(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
  return path;
}

export function requiresDocumentNavigation(path: string) {
  return /^\/(?:nostar|nomoney|yumi|nodesk)(?:\/|$)/.test(path);
}
