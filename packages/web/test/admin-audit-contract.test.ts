import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('admin audit log entry', () => {
  it('registers an administrator-only audit page in the persistent shell', () => {
    const router = read('src/router/index.ts');
    const layout = read('src/components/AdminLayout.vue');
    const viewPath = path.resolve(process.cwd(), 'src/views/admin/AuditLogsView.vue');

    expect(fs.existsSync(viewPath)).toBe(true);
    expect(router).toContain("const AuditLogsView = () => import('@/views/admin/AuditLogsView.vue')");
    expect(router).toContain("path: '/admin/audit', component: AuditLogsView");
    expect(layout).toContain("to: '/admin/audit'");
    expect(layout).toContain("label: '审计日志'");
  });
});
