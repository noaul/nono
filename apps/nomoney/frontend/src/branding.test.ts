import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney branding', () => {
  it('uses NoMoney across visible application chrome', () => {
    const files = ['../index.html', 'App.tsx', 'AuthPages.tsx', 'Layout.tsx'];
    const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), 'src', file), 'utf8')).join('\n');

    expect(source).toContain('NoMoney');
    expect(source).not.toContain('Moneypulse');
  });

  it('provides accessible mobile navigation and global interaction baselines', () => {
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'src/Layout.tsx'), 'utf8');
    const styles = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

    expect(layout).toContain('role="dialog"');
    expect(layout).toContain('aria-modal="true"');
    expect(layout).toContain("event.key === 'Escape'");
    expect(layout).toContain("event.key !== 'Tab'");
    expect(layout).toContain("document.body.style.overflow = 'hidden'");
    expect(layout).toContain("window.addEventListener('resize', closeMobileNavigationAtDesktop)");
    expect(layout).toContain('window.innerWidth >= 768');
    expect(styles).toContain('scrollbar-gutter: stable');
    expect(styles).toContain('touch-action: manipulation');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('safe-area-inset-bottom');
  });
});
