import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('single-user administration navigation', () => {
  it('keeps tokens in Account and removes standalone users, backups, and registration UI', () => {
    const router = read('src/router/index.ts');
    const layout = read('src/components/AdminLayout.vue');
    const dashboard = read('src/views/admin/AdminDashboard.vue');

    expect(router).not.toContain("import('@/views/admin/TokensView.vue')");
    expect(router).not.toContain("import('@/views/admin/BackupsView.vue')");
    expect(router).not.toContain("import('@/views/admin/UsersView.vue')");
    expect(router).not.toContain("import('@/views/RegisterView.vue')");
    expect(router).toContain("{ path: '/admin/tokens', redirect: '/admin/account#api-tokens' }");
    expect(router).toContain("{ path: '/admin/users', redirect: '/admin/account' }");
    expect(layout).not.toContain("to: '/admin/tokens'");
    expect(layout).not.toContain("to: '/admin/backups'");
    expect(layout).not.toContain("to: '/admin/users'");
    expect(dashboard).toContain("to: '/admin/account#api-tokens'");
  });
});
