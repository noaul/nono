import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { translate } from '../src/locales';
import { router } from '../src/router';

describe('NoTab management entry', () => {
  it('keeps the NoTab route inside the unified bookmark workspace', () => {
    const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');
    const layoutSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminLayout.vue'), 'utf8');
    const viewPath = path.resolve(process.cwd(), 'src/views/admin/NotabsView.vue');

    expect(layoutSource).toContain("labelKey: 'admin.navContentManagement'");
    expect(layoutSource).toContain("matches: ['/admin/notabs', '/admin/folders', '/admin/links']");
    expect(translate('zh', 'admin.navContentManagement')).toBe('文件夹及书签管理');
    expect(translate('zh', 'admin.navNotabs')).toBe('NoTab 管理');
    expect(routerSource).toContain("path: '/admin/notabs'");
    expect(fs.existsSync(viewPath)).toBe(true);
  });

  it('keeps bookmark creation inside bookmark management', () => {
    const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');
    const layoutSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminLayout.vue'), 'utf8');

    expect(layoutSource).not.toContain("to: '/admin/add-bookmark', label: '新增书签'");
    expect(routerSource).toContain("path: '/admin/add-bookmark', redirect: '/admin/links'");
    expect(routerSource).toContain("path: '/admin/bookmarks', redirect: '/admin/links'");
  });

  it('redirects the former folder page into the merged folder and bookmark workspace', () => {
    const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');

    expect(routerSource).not.toContain("const FoldersView = () => import('@/views/admin/FoldersView.vue')");
    expect(routerSource).toContain("path: '/admin/folders', redirect: '/admin/links#folder-management'");

    const scrollBehavior = router.options.scrollBehavior;
    expect(scrollBehavior).toBeTypeOf('function');
    expect(scrollBehavior!({ hash: '#folder-management' } as never, {} as never, null)).toEqual({
      el: '#folder-management',
      top: 16,
    });
    expect(scrollBehavior!({ hash: '' } as never, {} as never, null)).toEqual({ top: 0 });
  });
});
