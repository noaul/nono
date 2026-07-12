// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitHighlight } from '../src/utils/highlight';
import { getSelectedEngineId, resolveSearchTemplate, setSelectedEngineId } from '../src/utils/searchEngines';

const store = new Map<string, string>();

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  });
});

describe('splitHighlight', () => {
  it('returns the whole text unmarked when the query is empty', () => {
    expect(splitHighlight('GitHub', '')).toEqual([{ text: 'GitHub', hit: false }]);
  });

  it('marks case-insensitive matches and keeps original casing', () => {
    expect(splitHighlight('GitHub Gist', 'git')).toEqual([
      { text: 'Git', hit: true },
      { text: 'Hub Gist', hit: false },
    ]);
  });

  it('marks repeated matches', () => {
    const segments = splitHighlight('aXbXc', 'x');
    expect(segments.filter((segment) => segment.hit)).toHaveLength(2);
    expect(segments.map((segment) => segment.text).join('')).toBe('aXbXc');
  });
});

describe('search engine selection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to the site template when nothing is picked', () => {
    expect(getSelectedEngineId()).toBe('default');
    expect(resolveSearchTemplate('https://site.example/?q={query}')).toBe('https://site.example/?q={query}');
  });

  it('persists a picked engine and resolves its template', () => {
    setSelectedEngineId('bing');
    expect(getSelectedEngineId()).toBe('bing');
    expect(resolveSearchTemplate('https://site.example/?q={query}')).toBe('https://www.bing.com/search?q={query}');
  });

  it('ignores unknown persisted values', () => {
    localStorage.setItem('nono:search-engine', 'altavista');
    expect(getSelectedEngineId()).toBe('default');
  });
});
