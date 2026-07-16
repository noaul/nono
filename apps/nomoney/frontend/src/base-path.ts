export function normalizeBasePath(value: string): string {
  const normalized = `/${value.trim()}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized === '/' ? '' : normalized;
}

export const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export function withBasePath(pathname: string, basePath = appBasePath): string {
  const normalizedBase = normalizeBasePath(basePath);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${normalizedBase}${path}` || '/';
}
