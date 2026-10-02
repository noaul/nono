import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney branding', () => {
  it('uses NoMoney across visible application chrome', () => {
    const files = ['../index.html', 'App.tsx', 'Layout.tsx'];
    const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), 'src', file), 'utf8')).join('\n');

    expect(source).toContain('NoMoney');
    expect(source).not.toContain('Moneypulse');
  });

  it('provides accessible mobile navigation and global interaction baselines', () => {
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'src/Layout.tsx'), 'utf8');
    const styles = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

    // 更多 opens a menu above the dock instead of a drawer, and closes on Escape or an outside tap.
    expect(layout).toContain('role="menu"');
    expect(layout).toContain('aria-haspopup="menu"');
    expect(layout).toContain("event.key === 'Escape'");
    expect(layout).toContain("document.addEventListener('pointerdown', onPointerDown)");
    expect(layout).toContain('bottom-full');
    expect(layout).not.toContain('<aside');
    expect(styles).toContain('scrollbar-gutter: stable');
    expect(styles).toContain('touch-action: manipulation');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('safe-area-inset-bottom');
  });

  it('follows the shared NoNo UI contract: teal accent, solid chrome, a way back to the family', () => {
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'src/Layout.tsx'), 'utf8');
    const styles = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');
    const sources = fs.readdirSync(path.resolve(process.cwd(), 'src'))
      .filter((file) => /\.(tsx|css)$/.test(file) && file !== 'design-tokens.css')
      .map((file) => fs.readFileSync(path.resolve(process.cwd(), 'src', file), 'utf8'))
      .join('\n');

    // The Tailwind theme lives in the @theme block of styles.css.
    expect(styles).toContain('--color-brand-600: #0d9488;');
    expect(styles.toLowerCase()).not.toContain('#2563eb');
    expect(sources).not.toMatch(/backdrop-blur|backdrop-filter|bg-gradient-|font-extrabold|font-black/);
    expect(styles).not.toContain('rgb(var(--ui-border-rgb))');

    expect(layout).toContain("href: '/'");
    expect(layout).toContain("href: '/nodesk'");
    expect(layout).toContain("href: '/nostar/'");
    expect(layout).toContain("href: '/nomoney/'");
    expect(layout).toContain("href: '/yumi/'");
    expect(layout).toContain("aria-current={active ? 'page' : undefined}");
  });
});
