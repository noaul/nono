import type { MessageKey } from '@/locales';

export type SearchEngine = {
  id: string;
  /** Admin-authored engine names stay as typed; they are site data, not UI chrome. */
  label: string;
  /** Set only on the built-in entry, which is chrome and therefore translated. */
  labelKey?: MessageKey;
  short: string;
  template: string | null;
  enabled: boolean;
};

export type SearchEngineSettings = {
  defaultId: string;
  items: SearchEngine[];
};

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'default', label: 'Site default', labelKey: 'search.siteDefaultEngine', short: '·', template: null, enabled: true },
  { id: 'google', label: 'Google', short: 'G', template: 'https://www.google.com/search?q={query}', enabled: true },
  { id: 'bing', label: 'Bing', short: 'B', template: 'https://www.bing.com/search?q={query}', enabled: true },
  { id: 'baidu', label: '百度', short: '百', template: 'https://www.baidu.com/s?wd={query}', enabled: true },
  { id: 'duckduckgo', label: 'DuckDuckGo', short: 'D', template: 'https://duckduckgo.com/?q={query}', enabled: true },
];

const STORAGE_KEY = 'nono:search-engine';

export function getSearchEngineSettings(settings?: Record<string, unknown> | null, siteTemplate?: string | null): SearchEngineSettings {
  const source = settings?.searchEngines;
  if (!isRecord(source) || !Array.isArray(source.items)) {
    return {
      defaultId: 'default',
      items: SEARCH_ENGINES.map((engine) => ({
        ...engine,
        template: engine.id === 'default' ? siteTemplate || null : engine.template,
      })),
    };
  }

  const seen = new Set<string>();
  const items = source.items.flatMap((value): SearchEngine[] => {
    if (!isRecord(value)) return [];
    const id = String(value.id || '').trim();
    const label = String(value.label || '').trim();
    const template = String(value.template || '').trim();
    if (!id || !label || !template.includes('{query}') || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      label,
      short: String(value.short || label.slice(0, 1)).trim().slice(0, 4) || '#',
      template,
      enabled: value.enabled !== false,
    }];
  });

  const enabled = items.filter((engine) => engine.enabled);
  if (!enabled.length) return getSearchEngineSettings(undefined, siteTemplate);
  const requestedDefault = String(source.defaultId || '');
  return {
    defaultId: enabled.some((engine) => engine.id === requestedDefault) ? requestedDefault : enabled[0].id,
    items,
  };
}

export function getSelectedEngineId(settings: SearchEngineSettings = getSearchEngineSettings()): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && settings.items.some((engine) => engine.id === stored && engine.enabled)) return stored;
  } catch {
    // localStorage can be unavailable in private mode or SSR.
  }
  return settings.defaultId;
}

export function setSelectedEngineId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Best-effort persistence only.
  }
}

export function getEngine(id: string, settings: SearchEngineSettings = getSearchEngineSettings()): SearchEngine {
  return settings.items.find((engine) => engine.id === id && engine.enabled)
    || settings.items.find((engine) => engine.id === settings.defaultId && engine.enabled)
    || settings.items.find((engine) => engine.enabled)
    || SEARCH_ENGINES[0];
}

export function resolveSearchTemplate(siteTemplate?: string | null, settings: SearchEngineSettings = getSearchEngineSettings(undefined, siteTemplate)): string | undefined {
  const engine = getEngine(getSelectedEngineId(settings), settings);
  return engine.template || siteTemplate || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
