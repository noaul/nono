import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Privacy policy entry', () => {
  it('exposes a public privacy route before the username fallback', () => {
    const router = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');
    const view = fs.readFileSync(path.resolve(process.cwd(), 'src/views/PrivacyView.vue'), 'utf8');

    expect(router.indexOf("{ path: '/privacy', component: PrivacyView }")).toBeGreaterThan(-1);
    expect(router.indexOf("{ path: '/privacy', component: PrivacyView }")).toBeLessThan(router.indexOf("{ path: '/:username', component: NavigationPage }"));
    expect(view).toContain('隐私政策');
    expect(view).toContain('网站内容');
    expect(view).toContain('不会出售');
  });
});
