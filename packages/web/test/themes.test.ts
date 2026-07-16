import { describe, expect, it } from 'vitest';
import { PUBLIC_THEMES, accentCssVars, getTheme, getThemeAccentVars } from '../src/utils/themes';

describe('public themes', () => {
  it('ships five presets with unique ids and complete fields', () => {
    expect(PUBLIC_THEMES).toHaveLength(5);
    const ids = new Set(PUBLIC_THEMES.map((theme) => theme.id));
    expect(ids.size).toBe(5);
    for (const theme of PUBLIC_THEMES) {
      expect(theme.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.fontColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.cardColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.searchColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.bookmarkTextColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.categoryTextColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.tabColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.cardRadius).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(PUBLIC_THEMES.map((theme) => theme.appearance.cardColor)).size).toBeGreaterThan(3);
    expect(new Set(PUBLIC_THEMES.map((theme) => theme.appearance.tabColor)).size).toBeGreaterThan(3);
    expect(new Set(PUBLIC_THEMES.map((theme) => theme.appearance.bookmarkTextColor)).size).toBeGreaterThan(1);
  });

  it('resolves a theme by id', () => {
    expect(getTheme('midnight-glass')?.name).toBe('暗夜玻璃');
    expect(getTheme('nope')).toBeUndefined();
  });

  it('derives the full accent variable family from one hex', () => {
    const vars = accentCssVars('#10b981');
    expect(vars['--accent']).toBe('#10b981');
    expect(vars['--accent-rgb']).toBe('16, 185, 129');
    expect(vars['--accent-soft-rgb']).toMatch(/^\d+, \d+, \d+$/);
  });

  it('ignores invalid accents and missing settings', () => {
    expect(accentCssVars('red')).toEqual({});
    expect(getThemeAccentVars(null)).toEqual({});
    expect(getThemeAccentVars({ theme: { accent: '#8b5cf6' } })['--accent']).toBe('#8b5cf6');
  });
});
