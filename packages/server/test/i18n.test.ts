import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isLocale, resolveRequestLocale, t } from '../src/utils/i18n.js';

describe('server locale negotiation', () => {
  it('prefers the explicit client header over Accept-Language', () => {
    expect(resolveRequestLocale({ 'x-nono-locale': 'en', 'accept-language': 'zh-CN' })).toBe('en');
    expect(resolveRequestLocale({ 'x-nono-locale': 'zh', 'accept-language': 'en-US' })).toBe('zh');
  });

  it('falls back to Accept-Language, then Chinese', () => {
    expect(resolveRequestLocale({ 'accept-language': 'en-GB,en;q=0.9' })).toBe('en');
    expect(resolveRequestLocale({ 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' })).toBe('zh');
    // An unsupported language falls through to the next acceptable tag.
    expect(resolveRequestLocale({ 'accept-language': 'fr-FR,en;q=0.8' })).toBe('en');
    expect(resolveRequestLocale({ 'accept-language': 'fr-FR' })).toBe(DEFAULT_LOCALE);
    expect(resolveRequestLocale({})).toBe(DEFAULT_LOCALE);
  });

  it('ignores a junk header value', () => {
    expect(resolveRequestLocale({ 'x-nono-locale': 'klingon', 'accept-language': 'en' })).toBe('en');
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });

  it('renders both catalogues with interpolation', () => {
    expect(t('zh', 'dueInDays', { days: 3 })).toBe('3 天后到期');
    expect(t('en', 'dueInDays', { days: 3 })).toBe('Due in 3 days');
    expect(t('en', 'connectFailedHttp', { status: 502 })).toBe('Connection failed: HTTP 502');
    // A missing param stays visible rather than rendering an empty gap.
    expect(t('en', 'dueInDays')).toBe('Due in {days} days');
  });
});
