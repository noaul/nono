import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ColorModeControl from '../src/components/ColorModeControl.vue';
import {
  normalizeColorMode,
  resolveColorMode,
  storedColorMode,
  writeColorMode,
} from '../src/utils/colorMode.js';

describe('color mode preference', () => {
  it('normalizes unknown values to the system preference', () => {
    expect(normalizeColorMode('light')).toBe('light');
    expect(normalizeColorMode('dark')).toBe('dark');
    expect(normalizeColorMode('system')).toBe('system');
    expect(normalizeColorMode('night')).toBe('system');
    expect(normalizeColorMode(null)).toBe('system');
  });

  it('resolves system mode without changing explicit choices', () => {
    expect(resolveColorMode('system', true)).toBe('dark');
    expect(resolveColorMode('system', false)).toBe('light');
    expect(resolveColorMode('light', true)).toBe('light');
    expect(resolveColorMode('dark', false)).toBe('dark');
  });

  it('persists only supported preferences', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(storedColorMode(storage)).toBe('system');
    writeColorMode('dark', storage);
    expect(storedColorMode(storage)).toBe('dark');
    values.set('nono:color-mode', 'invalid');
    expect(storedColorMode(storage)).toBe('system');
  });
});

describe('ColorModeControl', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-color-mode');
    document.documentElement.removeAttribute('data-color-mode-preference');
    vi.restoreAllMocks();
  });

  it('persists and applies an explicit dark preference', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const wrapper = mount(ColorModeControl);
    await wrapper.get('.color-mode-trigger').trigger('click');
    const darkOption = wrapper.findAll('.color-mode-popover button').find((button) => button.text().includes('深色'));
    expect(darkOption).toBeDefined();
    await darkOption!.trigger('click');

    expect(storage.setItem).toHaveBeenCalledWith('nono:color-mode', 'dark');
    expect(document.documentElement.dataset.colorMode).toBe('dark');
    expect(document.documentElement.dataset.colorModePreference).toBe('dark');
    expect(wrapper.get('.color-mode-trigger').attributes('title')).toContain('深色');
    wrapper.unmount();
  });
});
