import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards for Tailwind class strings.
 *
 * Fused tokens like `bg-light-surfacetext-gray-900` are silently dropped by Tailwind — the
 * element simply gets no styling — so they are invisible in review and in the build. A few crept
 * in through earlier edits; these tests stop them coming back.
 */

const SOURCE_ROOT = path.resolve(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

// This file quotes the very patterns it forbids, so it excludes itself from the scan.
const files = sourceFiles(SOURCE_ROOT)
  .filter((file) => !file.endsWith('tailwind-tokens.test.ts'))
  .map((file) => ({
    file: path.relative(process.cwd(), file),
    text: fs.readFileSync(file, 'utf8'),
  }));

describe('Tailwind class hygiene', () => {
  it('has no fused utility tokens', () => {
    // Each pattern is a real defect seen in this codebase: a colour name run together with the
    // next utility, or a numeric suffix swallowed from an opacity modifier.
    const patterns: Array<[string, RegExp]> = [
      ['colour name fused with the next utility', /\b(?:bg|text|border|ring)-[a-z-]+(?:bg|text|border|ring)-[a-z]/],
      ['opacity modifier fused into the name', /\bbg-light-bg\d/],
      ['numeric suffix fused into a status colour', /\bbg-status-emerald\d/],
      // Any second modifier, whether after an arbitrary value (`/[0.04]/50`) or a plain one
      // (`/20/20`). Tailwind drops the whole utility either way.
      ['double opacity modifier', /[a-z][\w-]*\/(?:\[[^\]]+\]|\d{1,3})\/(?:\[[^\]]+\]|\d{1,3})(?![\w/])/],
      ['modifier fused with a name suffix', /\/\[[^\]]+\]-[a-z]/],
    ];

    const offenders: string[] = [];
    for (const { file, text } of files) {
      for (const [label, pattern] of patterns) {
        const match = pattern.exec(text);
        if (match) offenders.push(`${file}: ${label} -> ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps filled primary buttons readable, whatever order the classes appear in', () => {
    // Class order in an attribute is arbitrary, so the earlier `bg-x text-white` substring check
    // missed real cases. Split each class string into a set and reason about it instead.
    const FILLS = ['bg-brand-indigo', 'bg-brand-violet', 'bg-brand-hover', 'bg-status-red', 'bg-status-emerald'];
    const offenders: string[] = [];

    for (const { file, text } of files) {
      for (const match of text.matchAll(/(?:className|class)\s*=\s*[{]?[`'"]([^`'"]+)[`'"]/g)) {
        const classes = match[1].split(/\s+/).filter(Boolean);
        const has = (c: string) => classes.includes(c);
        const filled = FILLS.find(has);

        // A white-on-white fill: a light surface paired with white text.
        if (has('text-white') && (has('bg-white') || has('bg-gray-100') || has('bg-light-surface'))) {
          offenders.push(`${file}: white text on a light fill -> ${match[1].slice(0, 80)}`);
          continue;
        }
        if (!filled || !has('text-white')) continue;

        // A filled primary must not be repainted grey on hover or blanked in dark mode.
        const conflicting = classes.filter((c) => /^hover:bg-(gray|white|slate)-\d/.test(c)
          || /^dark:bg-white\/\[/.test(c)
          || /^active:bg-(gray|white|slate)-\d/.test(c));
        if (conflicting.length) {
          offenders.push(`${file}: ${filled} + ${conflicting.join(' ')}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never places a bare surface token where a light-mode value would be white-on-white', () => {
    // `panel-dark` maps to --ui-surface, which is white in light mode. It is only safe behind a
    // `dark:` prefix or paired with an explicit light-mode background.
    const offenders: string[] = [];
    for (const { file, text } of files) {
      for (const match of text.matchAll(/(?<![\w:-])bg-panel-dark(?![\w/-])/g)) {
        const before = text.slice(Math.max(0, match.index - 12), match.index);
        if (!before.endsWith('dark:')) offenders.push(`${file} @${match.index}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('NoStar palette and typography contract', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  const config = fs.readFileSync(path.resolve(process.cwd(), 'tailwind.config.js'), 'utf8');

  it('has no retired Linear brand literals in the stylesheet or config', () => {
    // The purple brand accent, in both hex and the rgba() forms the interaction states used.
    for (const literal of ['94, 106, 210', '94,106,210', '113, 112, 255', '113,112,255',
      '#5e6ad2', '#7170ff', '#828fff']) {
      expect(css.toLowerCase(), `index.css contains ${literal}`).not.toContain(literal.toLowerCase());
      expect(config.toLowerCase(), `tailwind.config.js contains ${literal}`).not.toContain(literal.toLowerCase());
    }
  });

  it('keeps the selection keyframe off the old blues', () => {
    // These two only ever appeared in the selectionExit shadows, which are interaction chrome.
    // The syntax-highlighting theme in index.css keeps its own palette on purpose: `hljs-*`
    // token colours are semantic content, not accent.
    for (const literal of ['#3b82f6', '#60a5fa']) {
      expect(config.toLowerCase(), `tailwind.config.js contains ${literal}`).not.toContain(literal);
    }
    expect(config).toMatch(/selectionExit: \{[\s\S]*?var\(--ui-accent-ring\)/);
  });

  it('drives tap highlight, focus, selection and form focus from the contract', () => {
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*var\(--ui-accent-soft\)/);
    expect(css).toMatch(/:focus-visible \{[\s\S]*?outline:\s*2px solid var\(--ui-accent-ring\)/);
    expect(css).toMatch(/::selection \{[\s\S]*?background-color:\s*var\(--ui-accent-soft\)/);
    expect(css).toMatch(/box-shadow:\s*var\(--ui-focus-ring\)/);
  });

  it('sets every letter-spacing declaration to exactly 0', () => {
    // The rule is `letter-spacing: 0`, not merely "nothing negative": positive tracking on
    // uppercase eyebrows counts as a violation too.
    const declarations = [...css.matchAll(/letter-spacing:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(declarations.filter((value) => value !== '0')).toEqual([]);

    // Every entry in the custom tracking scale is 0 as well, so no `tracking-*` utility can
    // reintroduce it.
    const scale = /letterSpacing: \{([\s\S]*?)\}/.exec(config);
    expect(scale).not.toBeNull();
    const values = [...scale![1].matchAll(/:\s*'([^']*)'/g)].map((m) => m[1].trim());
    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((value) => value !== '0')).toEqual([]);
  });

  it('no longer defines the unused Linear card and panel helpers', () => {
    expect(css).not.toContain('.linear-card');
    expect(css).not.toContain('.linear-panel');
  });

  it('gives every light filled alias a readable ink in dark mode', () => {
    // Accent, hover, success and danger all resolve to light colours in dark mode, so white
    // text on them fails contrast.
    for (const alias of ['bg-brand-indigo', 'bg-brand-violet', 'bg-brand-hover',
      'bg-status-emerald', 'bg-status-green', 'bg-status-red']) {
      expect(css, alias).toContain(`.dark .${alias}.text-white`);
    }
    expect(css).toMatch(/\.dark \.bg-brand-indigo\.text-white[\s\S]*?color:\s*var\(--ui-accent-ink\)/);
    expect(css).toMatch(/\.dark \.bg-status-emerald\.text-white[\s\S]*?color:\s*var\(--ui-canvas\)/);
  });
});

describe('desktop shell', () => {
  const shell = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

  it('keeps the Electron window drag region on the topbar', () => {
    // The retired header owned this; the topbar replaced it and has to carry it.
    expect(shell).toMatch(/className="nostar-topbar hd-drag"/);
    expect(css).toMatch(/\.hd-drag \{[\s\S]*?-webkit-app-region:\s*drag/);
  });

  it('opts every interactive topbar region out of the drag region', () => {
    expect(shell).toMatch(/className="nostar-topbar-title hd-btns"/);
    expect(shell).toMatch(/className="nostar-topbar-actions hd-btns"/);
    expect(css).toMatch(/\.hd-btns \{[\s\S]*?-webkit-app-region:\s*no-drag/);
  });

  it('disables dragging at mobile widths so normal browser behaviour is preserved', () => {
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.hd-drag \{[\s\S]*?-webkit-app-region:\s*no-drag/);
  });
});
