import { mount } from '@vue/test-utils';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import AppearanceEditor from '../src/components/admin/AppearanceEditor.vue';
import { appearanceDefaults } from '../src/utils/appearance';

describe('admin performance contract', () => {
  it('uses one persistent admin shell for all admin child routes', () => {
    const routerSource = fs.readFileSync('src/router/index.ts', 'utf8');

    expect(routerSource).toContain("path: '/admin'");
    expect(routerSource).toMatch(/path:\s*'\/admin'[\s\S]*?children:\s*\[/);
    expect(routerSource).toMatch(/path:\s*'site'[\s\S]*?component:\s*SiteConfigView/);
    expect(routerSource).toMatch(/path:\s*'folders'[\s\S]*?component:\s*FoldersView/);
    expect(routerSource).toMatch(/path:\s*'links'[\s\S]*?component:\s*LinksView/);
  });

  it('turns off live preview blur while a range control is being dragged', async () => {
    const wrapper = mount(AppearanceEditor, {
      props: {
        appearance: { ...appearanceDefaults },
        previewBg: '#090a0f',
      },
    });

    const controls = wrapper.get('.appearance-controls');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('data-interacting')).toBe('false');

    await controls.trigger('pointerdown');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('data-interacting')).toBe('true');

    await controls.trigger('pointerup');
    expect(wrapper.get('[data-testid="appearance-preview"]').attributes('data-interacting')).toBe('false');

    const source = fs.readFileSync('src/components/admin/AppearanceEditor.vue', 'utf8');
    expect(source).toMatch(/appearance-preview\[data-interacting='true'\][\s\S]*?backdrop-filter:\s*none/);
  });
});
