import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { translate } from '../src/locales';

describe('Privacy policy entry', () => {
  it('exposes a public privacy route before the username fallback', () => {
    const router = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');
    const view = fs.readFileSync(path.resolve(process.cwd(), 'src/views/PrivacyView.vue'), 'utf8');

    expect(router.indexOf("{ path: '/privacy', component: PrivacyView }")).toBeGreaterThan(-1);
    expect(router.indexOf("{ path: '/privacy', component: PrivacyView }")).toBeLessThan(router.indexOf("{ path: '/:username', component: NavigationPage }"));
    // The heading is a catalogue key now; assert the wiring plus the resolved text.
    expect(view).toContain("t('privacy.title')");
    expect(translate('zh', 'privacy.title')).toBe('隐私政策');
    expect(translate('en', 'privacy.title')).toBe('Privacy policy');
    // The Chrome Web Store disclosures now live in the catalogue; assert both locales state them.
    expect(translate('zh', 'privacy.dataBody1')).toContain('网站内容');
    expect(translate('en', 'privacy.dataBody1')).toContain('website content');
    expect(translate('zh', 'privacy.never1')).toContain('不会出售');
    expect(translate('en', 'privacy.never1')).toContain('never sell');
  });
});
