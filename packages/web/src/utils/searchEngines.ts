export type SearchEngine = {
  id: string;
  label: string;
  short: string;
  template: string | null; // null = use the site-configured template
};

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'default', label: '站点默认', short: '默', template: null },
  { id: 'google', label: 'Google', short: 'G', template: 'https://www.google.com/search?q={query}' },
  { id: 'bing', label: 'Bing', short: 'B', template: 'https://www.bing.com/search?q={query}' },
  { id: 'baidu', label: '百度', short: '百', template: 'https://www.baidu.com/s?wd={query}' },
  { id: 'duckduckgo', label: 'DuckDuckGo', short: 'D', template: 'https://duckduckgo.com/?q={query}' },
];

const STORAGE_KEY = 'nono:search-engine';

export function getSelectedEngineId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SEARCH_ENGINES.some((engine) => engine.id === stored)) return stored;
  } catch {
    // localStorage unavailable (private mode / SSR) — fall back to default.
  }
  return 'default';
}

export function setSelectedEngineId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Best-effort persistence only.
  }
}

export function getEngine(id: string): SearchEngine {
  return SEARCH_ENGINES.find((engine) => engine.id === id) || SEARCH_ENGINES[0];
}

/** Returns the URL template to use: the picked engine's, or the site default. */
export function resolveSearchTemplate(siteTemplate?: string | null): string | undefined {
  const engine = getEngine(getSelectedEngineId());
  return engine.template || siteTemplate || undefined;
}
