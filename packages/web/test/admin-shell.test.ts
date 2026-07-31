import fs from 'node:fs';
import path from 'node:path';
import { h } from 'vue';
import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import AdminLayout from '../src/components/AdminLayout.vue';
import AdminPageHeader from '../src/components/admin/AdminPageHeader.vue';

/**
 * The admin shell used to be five stacked skins on one element (workbench, glass, figma,
 * chatgpt, plus a legacy fallback) that resolved by specificity. These tests hold the collapsed
 * result in place: one shell class, one definition per primitive, geometry from the shared
 * contract in docs/design/ui-contract.md.
 */

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
const readAdminCss = () => read('src/styles/admin.css');
const readLayout = () => read('src/components/AdminLayout.vue');

function mountShell() {
  setActivePinia(createPinia());
  return mount(AdminLayout, {
    global: {
      stubs: { RouterLink: RouterLinkStub, RouterView: true, ToastHost: true, ConfirmDialog: true, NotificationBell: true },
      mocks: { $route: { path: '/admin' } },
    },
  });
}

describe('admin shell', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders exactly one shell class instead of a stack of skins', () => {
    const wrapper = mountShell();
    const shell = wrapper.get('.admin-shell');

    expect(shell.classes()).toEqual(['admin-shell']);
    for (const retired of ['app-workbench', 'glass-workbench', 'admin-glass-enabled', 'figma-admin-shell', 'chatgpt-admin-shell']) {
      expect(wrapper.find(`.${retired}`).exists(), retired).toBe(false);
    }
  });

  it('keeps the sidebar, topbar, stage and nav structure', () => {
    const wrapper = mountShell();

    expect(wrapper.find('.workbench-sidebar').exists()).toBe(true);
    expect(wrapper.find('.workbench-topbar').exists()).toBe(true);
    expect(wrapper.find('.workbench-stage').exists()).toBe(true);
    expect(wrapper.findAll('.nav-section')).toHaveLength(3);
    expect(wrapper.find('.operator-card').exists()).toBe(true);
  });

  it('renders a single h1, in the topbar', () => {
    const wrapper = mountShell();
    const headings = wrapper.findAll('h1');

    // The sidebar brand used to be a second h1 competing with the page title.
    expect(headings).toHaveLength(1);
    expect(wrapper.find('.page-title h1').exists()).toBe(true);
    expect(wrapper.get('.sidebar-brand').find('h1').exists()).toBe(false);
  });

  it('keeps a single h1 when a real page header is rendered into the slot', () => {
    setActivePinia(createPinia());
    const wrapper = mount(AdminLayout, {
      global: {
        stubs: { RouterLink: RouterLinkStub, RouterView: true, ToastHost: true, ConfirmDialog: true, NotificationBell: true },
        mocks: { $route: { path: '/admin/links' } },
      },
      slots: {
        default: h(AdminPageHeader, { eyebrow: '内容管理', title: '书签管理', description: '按 Notab 整理书签。' }),
      },
    });

    // The topbar owns the only h1; the in-page header is an h2 beneath it.
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.find('.workbench-topbar h1').exists()).toBe(true);
    expect(wrapper.findAll('h2.admin-page-title')).toHaveLength(1);
    expect(wrapper.get('h2.admin-page-title').text()).toBe('书签管理');
    // Descriptions and actions survive the demotion.
    expect(wrapper.get('.admin-page-description').text()).toContain('按 Notab');
    expect(wrapper.get('.admin-page-eyebrow').text()).toBe('内容管理');
  });

  it('styles the in-page heading as a quiet section heading', () => {
    const css = readAdminCss();

    expect(css).toMatch(/\.admin-page-title \{[\s\S]*?font-size:\s*15px/);
    expect(css).toMatch(/\.admin-page-title \{[\s\S]*?letter-spacing:\s*0;/);
  });

  it('sets every letter-spacing in the unified admin surface to exactly 0', () => {
    // The rule is `letter-spacing: 0`, not merely "nothing negative": the positive tracking the
    // uppercase eyebrows used counts as a violation too. LanguageControl is included because it
    // renders inside this shell.
    const sources: Array<[string, string]> = [
      ['admin.css', readAdminCss()],
      ['LanguageControl.vue', read('src/components/LanguageControl.vue')],
      ['ColorModeControl.vue', read('src/components/ColorModeControl.vue')],
      ['AdminLayout.vue', readLayout()],
    ];

    const offenders: string[] = [];
    for (const [name, text] of sources) {
      for (const match of text.matchAll(/letter-spacing:\s*([^;]+);/g)) {
        const value = match[1].trim();
        if (value !== '0') offenders.push(`${name}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('drives every shell dimension from the shared contract', () => {
    const css = readAdminCss();

    expect(css).toMatch(/\.workbench-sidebar \{[\s\S]*?width:\s*var\(--ui-sidebar-w\)/);
    expect(css).toMatch(/\.workbench-main \{[\s\S]*?padding-left:\s*var\(--ui-sidebar-w\)/);
    expect(css).toMatch(/\.workbench-topbar \{[\s\S]*?min-height:\s*var\(--ui-topbar-h\)/);
    expect(css).toMatch(/\.workbench-topbar \{[\s\S]*?position:\s*sticky/);
    expect(css).toMatch(/\.workbench-stage \{[\s\S]*?max-width:\s*var\(--ui-content-max\)/);
    expect(css).toMatch(/\.nav-button \{[\s\S]*?height:\s*var\(--ui-control-h\)/);
    expect(css).toContain("@import './design-tokens.css';");
  });

  it('has no leftover skin layers or hard-coded palettes', () => {
    const css = readAdminCss();

    for (const marker of [
      'ChatGPT-inspired', 'Figma-inspired', 'Glassmorphism', 'glass-workbench',
      'chatgpt-admin-shell', 'figma-admin-shell', 'app-workbench', 'glass-surface',
    ]) {
      expect(css, marker).not.toContain(marker);
    }
    // Colour comes from the contract only; no per-app hex values in the admin sheet.
    const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toEqual([]);
    expect(css).not.toContain('backdrop-filter: blur(');
    expect(css).not.toContain('linear-gradient(');
  });

  it('turns the sidebar into a drawer below the md breakpoint only', () => {
    const css = readAdminCss();
    const layout = readLayout();

    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.workbench-sidebar \{[\s\S]*?transform:\s*translateX\(-100%\)/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.workbench-main \{[\s\S]*?padding-left:\s*0/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.mobile-nav-backdrop \{[\s\S]*?display:\s*block/);
    // The script's desktop-close threshold has to agree with the stylesheet.
    expect(layout).toContain('window.innerWidth >= 768');
  });

  it('gives the mobile drawer dialog semantics and closes on navigation', async () => {
    const wrapper = mountShell();
    const sidebar = () => wrapper.get('.workbench-sidebar');

    expect(sidebar().attributes('role')).toBeUndefined();
    await wrapper.get('.mobile-nav-toggle').trigger('click');

    expect(sidebar().attributes('role')).toBe('dialog');
    expect(sidebar().attributes('aria-modal')).toBe('true');
    expect(sidebar().classes()).toContain('is-mobile-open');
    expect(wrapper.find('.mobile-nav-backdrop').exists()).toBe(true);

    await wrapper.get('.mobile-nav-backdrop').trigger('click');
    expect(sidebar().classes()).not.toContain('is-mobile-open');
  });

  it('never lets the shell scroll sideways', () => {
    const css = readAdminCss();

    expect(css).toMatch(/\.admin-shell \{[\s\S]*?overflow-x:\s*hidden/);
    // Wide tables become stacked cards on mobile rather than a horizontal scroll trap.
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.mobile-card-table tr \{[\s\S]*?display:\s*block/);
    expect(css).toContain("content: attr(data-label)");
  });

  it('keeps the active nav row a solid block rather than a tinted pill', () => {
    const css = readAdminCss();

    expect(css).toMatch(/\.nav-button\.router-link-active[\s\S]*?background:\s*var\(--ui-text\)/);
    expect(css).toMatch(/\.nav-button\.router-link-active[\s\S]*?color:\s*var\(--ui-canvas\)/);
  });

  it('keeps drag performance and folder nesting behaviour', () => {
    const css = readAdminCss();

    expect(css).toContain(".sortable-list[data-dragging='true'] .sortable-admin-row");
    expect(css).toMatch(/sortable-row-dragging[\s\S]*?backdrop-filter:\s*none/);
    expect(css).toContain('var(--folder-depth, 0)');
    expect(css).toMatch(/\.workbench-stage > \* \{[\s\S]*?width:\s*100%/);
  });

  it('respects reduced motion', () => {
    const css = readAdminCss();
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration:\s*0\.01ms/);
  });
});
