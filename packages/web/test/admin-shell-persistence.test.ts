import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('persistent admin shell', () => {
  it('mounts AdminLayout once as the parent of all admin routes', () => {
    const router = read('src/router/index.ts');
    const layout = read('src/components/AdminLayout.vue');

    expect(router).toContain("const AdminLayout = () => import('@/components/AdminLayout.vue')");
    expect(router).toMatch(/path:\s*'\/admin',[\s\S]*?component:\s*AdminLayout,[\s\S]*?children:\s*\[/);
    expect(layout).toContain('<RouterView />');
    expect(layout.match(/class="workbench-sidebar/g)).toHaveLength(1);
    expect(layout.match(/class="workbench-topbar/g)).toHaveLength(1);
  });

  it('keeps page views focused on page content instead of remounting the shell', () => {
    const views = [
      'AccountView.vue',
      'AdminDashboard.vue',
      'FoldersView.vue',
      'LinksView.vue',
      'LlmView.vue',
      'NotabsView.vue',
      'SiteConfigView.vue',
      'TokensView.vue',
      'UsersView.vue',
    ];

    for (const view of views) {
      const source = read(`src/views/admin/${view}`);
      expect(source).not.toContain("import AdminLayout from '@/components/AdminLayout.vue'");
      expect(source).not.toContain('<AdminLayout');
    }
  });
});
