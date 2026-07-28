import { describe, expect, it } from 'vitest';
import { catalogues, translate } from '../src/locales';
import { en } from '../src/locales/en';
import { zh } from '../src/locales/zh';
import {
  DEFAULT_LOCALE,
  getSiteDefaultLocale,
  htmlLang,
  isLocale,
  normalizeLocalePreference,
  resolveLocale,
  storedLocalePreference,
  writeLocalePreference,
} from '../src/utils/locale';

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

describe('locale resolution', () => {
  it('lets an explicit visitor choice win over the site default', () => {
    expect(resolveLocale('en', 'zh')).toBe('en');
    expect(resolveLocale('zh', 'en')).toBe('zh');
  });

  it('falls back to the site default, then Chinese, without sniffing the browser', () => {
    expect(resolveLocale('site', 'en')).toBe('en');
    expect(resolveLocale('site', null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('site', undefined)).toBe(DEFAULT_LOCALE);
    // An existing site that never set a default must stay Chinese for every visitor.
    expect(DEFAULT_LOCALE).toBe('zh');
  });

  it('normalizes junk preferences to following the site', () => {
    expect(normalizeLocalePreference('en')).toBe('en');
    expect(normalizeLocalePreference('zh')).toBe('zh');
    expect(normalizeLocalePreference('site')).toBe('site');
    expect(normalizeLocalePreference('klingon')).toBe('site');
    expect(normalizeLocalePreference(null)).toBe('site');
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });

  it('reads the admin-selected site default, ignoring anything unsupported', () => {
    expect(getSiteDefaultLocale({ i18n: { defaultLocale: 'en' } })).toBe('en');
    expect(getSiteDefaultLocale({ i18n: { defaultLocale: 'zh' } })).toBe('zh');
    expect(getSiteDefaultLocale({ i18n: { defaultLocale: 'de' } })).toBeNull();
    expect(getSiteDefaultLocale({ i18n: {} })).toBeNull();
    expect(getSiteDefaultLocale({})).toBeNull();
    expect(getSiteDefaultLocale(null)).toBeNull();
  });

  it('stores an override but clears the key when following the site again', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };

    writeLocalePreference('en', storage);
    expect(storedLocalePreference(storage)).toBe('en');

    writeLocalePreference('site', storage);
    expect(store.size).toBe(0);
    expect(storedLocalePreference(storage)).toBe('site');
  });

  it('maps locales onto html lang values', () => {
    expect(htmlLang('zh')).toBe('zh-CN');
    expect(htmlLang('en')).toBe('en');
  });
});

describe('message catalogues', () => {
  it('ships the same keys in both locales', () => {
    const zhKeys = flatten(zh).sort();
    const enKeys = flatten(en).sort();
    expect(enKeys).toEqual(zhKeys);
    expect(zhKeys.length).toBeGreaterThan(0);
    expect(Object.keys(catalogues)).toEqual(['zh', 'en']);
  });

  it('has no untranslated English values left as Chinese text', () => {
    const untranslated = flatten(en).filter((key) => {
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
      // 中/EN language names are intentionally identical in both catalogues.
      return typeof value === 'string' && /[一-鿿]/.test(value) && !key.startsWith('language.');
    });
    expect(untranslated).toEqual([]);
  });

  it('interpolates params and falls back readably for unknown keys', () => {
    expect(translate('en', 'appearance.presetApplied', { name: 'Night' })).toBe('Applied “Night”');
    expect(translate('zh', 'appearance.presetApplied', { name: '夜间' })).toBe('已应用“夜间”');
    // A missing param stays visible rather than rendering an empty gap.
    expect(translate('en', 'appearance.presetApplied')).toBe('Applied “{name}”');
    // @ts-expect-error unknown keys are rejected at compile time, and echo back at runtime.
    expect(translate('en', 'nope.missing')).toBe('nope.missing');
  });
});
