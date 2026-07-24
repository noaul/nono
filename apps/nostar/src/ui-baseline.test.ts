import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoStar UI baseline', () => {
  it('supports keyboard, touch, reduced motion, and mobile safe areas', () => {
    const styles = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const toast = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ui/Toast.tsx'), 'utf8');
    const toolbar = fs.readFileSync(path.resolve(process.cwd(), 'src/components/BulkActionToolbar.tsx'), 'utf8');

    expect(styles).toContain('scrollbar-gutter: stable');
    expect(styles).toContain('touch-action: manipulation');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('safe-area-inset-bottom');
    expect(toast).toContain('nostar-toast-viewport');
    expect(toolbar).toContain('nostar-bulk-toolbar');
  });

  it('does not ship the unused vulnerable router dependency', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.dependencies).not.toHaveProperty('react-router-dom');
  });
});
