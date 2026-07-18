import { describe, expect, it } from 'vitest';
import {
  PUBLIC_THEMES,
  accentCssVars,
  getTheme,
  getThemeAccentVars,
  themeCssVars,
} from '../src/utils/themes';

describe('public themes', () => {
  it('ships six seasonal presets with unique ids and complete visual tokens', () => {
    expect(PUBLIC_THEMES.map((theme) => theme.name)).toEqual([
      '夏日清爽',
      '冬日暖暖',
      '绿叶芬芳',
      '星光闪耀',
      '万物明朗',
      '雨落万物',
    ]);
    const ids = new Set(PUBLIC_THEMES.map((theme) => theme.id));
    expect(ids.size).toBe(6);
    for (const theme of PUBLIC_THEMES) {
      expect(['light', 'dark']).toContain(theme.tone);
      expect(theme.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.fontColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.surface.border).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.surface.highlight).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.surface.hover).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.surface.shadow).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.surface.overlay).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.scene.asset).toMatch(/^\/theme-scenes\/.+\.(?:png|jpg|webp)$/);
      expect(theme.scene.label.length).toBeGreaterThan(0);
      expect(theme.scene.opacity).toBeGreaterThan(0);
      expect(theme.scene.opacity).toBeLessThanOrEqual(1);
      expect(theme.appearance.cardColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.searchColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.bookmarkTextColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.notabTextColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.folderTextColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.categoryTextColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.tabColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.appearance.cardRadius).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(PUBLIC_THEMES.map((theme) => theme.appearance.cardColor)).size).toBeGreaterThan(3);
    expect(new Set(PUBLIC_THEMES.map((theme) => theme.appearance.tabColor)).size).toBeGreaterThan(3);
    expect(new Set(PUBLIC_THEMES.map((theme) => theme.appearance.bookmarkTextColor)).size).toBeGreaterThan(1);
  });

  it('resolves current ids and migrates legacy ids without breaking saved settings', () => {
    expect(getTheme('verdant-leaves')?.name).toBe('绿叶芬芳');
    expect(getTheme('midnight-glass')?.id).toBe('starlit-night');
    expect(getTheme('warm-paper')?.id).toBe('winter-glow');
    expect(getTheme('nope')).toBeUndefined();
  });

  it('exports page, surface, hover, shadow, and scene variables from one theme', () => {
    const theme = getTheme('rainy-world');
    expect(theme).toBeDefined();
    const vars = themeCssVars(theme!);

    expect(vars['--public-page-text']).toBe(theme!.fontColor);
    expect(vars['--public-page-text-rgb']).toMatch(/^\d+, \d+, \d+$/);
    expect(vars['--public-border-rgb']).toMatch(/^\d+, \d+, \d+$/);
    expect(vars['--public-highlight-rgb']).toMatch(/^\d+, \d+, \d+$/);
    expect(vars['--public-hover-rgb']).toMatch(/^\d+, \d+, \d+$/);
    expect(vars['--public-shadow-rgb']).toMatch(/^\d+, \d+, \d+$/);
    expect(vars['--public-overlay-rgb']).toMatch(/^\d+, \d+, \d+$/);
    expect(vars['--public-scene-opacity']).toBe(String(theme!.scene.opacity));
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
