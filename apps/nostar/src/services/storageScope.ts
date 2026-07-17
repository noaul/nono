export const STORAGE_SCOPE_KEY = 'nostar:nono-user-id';

export function getStorageScope(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_SCOPE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStorageScope(userId: string | number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_SCOPE_KEY, String(userId));
    return true;
  } catch {
    return false;
  }
}

export function scopedStorageKey(name: string): string {
  const scope = getStorageScope();
  return scope ? `${name}:nono:${scope}` : name;
}
