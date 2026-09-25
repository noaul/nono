import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLOR_MODE_EVENT,
  adoptColorMode,
  applyColorMode,
  currentColorMode,
  watchColorMode,
} from './colorMode';
import { adoptLocale, currentLocale, htmlLang, watchLocale } from './locale';

/** A controllable `(prefers-color-scheme: dark)` query. */
function mockSystemDark(initial: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  const original = window.matchMedia;
  window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia;
  return {
    set(dark: boolean) {
      query.matches = dark;
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
    restore: () => {
      window.matchMedia = original;
    },
  };
}

beforeEach(() => {
  window.localStorage.removeItem('nono:color-mode');
  window.localStorage.removeItem('nono:locale');
  document.documentElement.className = '';
  delete document.documentElement.dataset.colorMode;
});

describe('shared colour mode (nono:color-mode)', () => {
  let system: ReturnType<typeof mockSystemDark>;
  beforeEach(() => {
    system = mockSystemDark(true);
  });
  afterEach(() => system.restore());

  it("defaults to 'system' and resolves it from the OS", () => {
    expect(currentColorMode()).toBe('dark');
    system.set(false);
    expect(currentColorMode()).toBe('light');
  });

  it('lets an explicit preference override the OS', () => {
    window.localStorage.setItem('nono:color-mode', 'light');
    expect(currentColorMode()).toBe('light');
  });

  it('migrates a legacy theme only while the shared key is absent', () => {
    expect(adoptColorMode('light')).toBe('light');
    expect(window.localStorage.getItem('nono:color-mode')).toBe('light');
    expect(adoptColorMode('dark')).toBe('light');
  });

  it('applies both html.dark and data-color-mode, then announces the change', () => {
    const heard: string[] = [];
    const onChange = (event: Event) => heard.push((event as CustomEvent<string>).detail);
    window.addEventListener(COLOR_MODE_EVENT, onChange);

    applyColorMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.colorMode).toBe('dark');

    applyColorMode('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.colorMode).toBe('light');

    window.removeEventListener(COLOR_MODE_EVENT, onChange);
    expect(heard).toEqual(['dark', 'light']);
  });

  it("follows OS changes only while the preference is 'system'", () => {
    const onChange = vi.fn();
    const stop = watchColorMode(onChange);

    system.set(false);
    expect(onChange).toHaveBeenLastCalledWith('light');

    window.localStorage.setItem('nono:color-mode', 'dark');
    onChange.mockClear();
    system.set(true);
    expect(onChange).not.toHaveBeenCalled();

    stop();
    expect(system.listenerCount()).toBe(0);
  });

  it('picks up a change another NoNo tab makes to the shared key', () => {
    const onChange = vi.fn();
    const stop = watchColorMode(onChange);

    window.localStorage.setItem('nono:color-mode', 'light');
    window.dispatchEvent(new StorageEvent('storage', { key: 'nono:color-mode' }));
    expect(onChange).toHaveBeenLastCalledWith('light');

    stop();
  });
});

describe('shared locale (nono:locale)', () => {
  it('defaults to Chinese when no app has stored a locale', () => {
    expect(currentLocale()).toBe('zh');
    expect(htmlLang(currentLocale())).toBe('zh-CN');
  });

  it('migrates a legacy English choice once and never pins the default', () => {
    expect(adoptLocale('zh')).toBe('zh');
    expect(window.localStorage.getItem('nono:locale')).toBeNull();

    expect(adoptLocale('en')).toBe('en');
    expect(window.localStorage.getItem('nono:locale')).toBe('en');

    window.localStorage.setItem('nono:locale', 'zh');
    expect(adoptLocale('en')).toBe('zh');
  });

  it('picks up a language change made in another NoNo tab', () => {
    const onChange = vi.fn();
    const stop = watchLocale(onChange);

    window.localStorage.setItem('nono:locale', 'en');
    window.dispatchEvent(new StorageEvent('storage', { key: 'nono:locale' }));
    expect(onChange).toHaveBeenLastCalledWith('en');

    stop();
  });
});
