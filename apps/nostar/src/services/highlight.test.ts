import { describe, expect, it } from 'vitest';
import { normalizeHighlightLanguage } from './highlight';

describe('NoStar syntax highlighting', () => {
  it('keeps registered languages and aliases', () => {
    expect(normalizeHighlightLanguage('typescript')).toBe('typescript');
    expect(normalizeHighlightLanguage('TS')).toBe('typescript');
    expect(normalizeHighlightLanguage('ps1')).toBe('powershell');
    expect(normalizeHighlightLanguage('yml')).toBe('yaml');
  });

  it('falls back to plaintext for unsupported languages', () => {
    expect(normalizeHighlightLanguage('not-a-real-language')).toBe('plaintext');
    expect(normalizeHighlightLanguage('')).toBe('plaintext');
  });
});
