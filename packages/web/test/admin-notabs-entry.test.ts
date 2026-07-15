import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Notab management entry', () => {
  it('adds a dedicated Notab management route and sidebar item', () => {
    const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');
    const layoutSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminLayout.vue'), 'utf8');
    const viewPath = path.resolve(process.cwd(), 'src/views/admin/NotabsView.vue');

    expect(layoutSource).toContain("to: '/admin/notabs', label: 'Notab 管理'");
    expect(routerSource).toContain("path: '/admin/notabs'");
    expect(fs.existsSync(viewPath)).toBe(true);
  });
});
