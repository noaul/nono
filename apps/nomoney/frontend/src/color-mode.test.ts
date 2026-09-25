import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLOR_MODE_STORAGE_KEY, normalizeColorMode, readColorModePreference, resolveColorMode } from './color-mode';
import { LEGACY_LANGUAGE_KEY, LOCALE_STORAGE_KEY, readStoredLanguage } from './i18n';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value)
  };
}

describe('shared NoNo colour mode', () => {
  it('uses the shared key and defaults to following the system', () => {
    expect(COLOR_MODE_STORAGE_KEY).toBe('nono:color-mode');
    expect(readColorModePreference(memoryStorage())).toBe('system');
    expect(normalizeColorMode('invalid')).toBe('system');
    expect(resolveColorMode('system', true)).toBe('dark');
    expect(resolveColorMode('system', false)).toBe('light');
    expect(resolveColorMode('light', true)).toBe('light');
  });

  it('prefers the shared key over any retired per-app key', () => {
    const storage = memoryStorage({ 'nono:color-mode': 'light', 'nomoney-theme': 'dark' });
    expect(readColorModePreference(storage, ['nomoney-theme'])).toBe('light');
  });

  it('migrates a retired per-app choice once when the shared key is absent', () => {
    const storage = memoryStorage({ 'moneypulse-theme': 'light' });
    expect(readColorModePreference(storage, ['nomoney-theme', 'moneypulse-theme'])).toBe('light');
    expect(storage.values.get('nono:color-mode')).toBe('light');
  });

  it('marks the document and announces the resolved mode', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/color-mode.ts'), 'utf8');
    const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

    expect(source).toContain("root.classList.toggle('dark', resolved === 'dark')");
    expect(source).toContain('root.dataset.colorMode = resolved');
    expect(source).toContain("'nono-color-mode-change'");
    expect(source).toContain("'(prefers-color-scheme: dark)'");
    expect(main).toContain('initColorMode()');
    expect(main).not.toContain("?? 'dark'");
    expect(html).not.toContain('class="dark"');
  });
});

describe('shared NoNo locale', () => {
  it('reads nono:locale and treats an absent key as no explicit choice', () => {
    expect(LOCALE_STORAGE_KEY).toBe('nono:locale');
    expect(readStoredLanguage(memoryStorage())).toBeNull();
    expect(readStoredLanguage(memoryStorage({ 'nono:locale': 'en', 'moneypulse-language': 'zh' }))).toBe('en');
  });

  it('migrates the retired language key once', () => {
    const storage = memoryStorage({ [LEGACY_LANGUAGE_KEY]: 'en' });
    expect(readStoredLanguage(storage)).toBe('en');
    expect(storage.values.get('nono:locale')).toBe('en');
  });

  it('does not turn a retired Chinese choice into an explicit override', () => {
    const storage = memoryStorage({ [LEGACY_LANGUAGE_KEY]: 'zh' });
    expect(readStoredLanguage(storage)).toBeNull();
    expect(storage.values.has('nono:locale')).toBe(false);
  });

  it('only ever writes the shared key', () => {
    const i18n = fs.readFileSync(path.resolve(process.cwd(), 'src/i18n.tsx'), 'utf8');
    const settings = fs.readFileSync(path.resolve(process.cwd(), 'src/SettingsPage.tsx'), 'utf8');
    expect(i18n).toContain('localStorage.setItem(LOCALE_STORAGE_KEY, next)');
    expect(i18n).not.toContain("setItem('moneypulse-language'");
    expect(settings).not.toContain('moneypulse-language');
  });
});
