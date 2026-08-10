import { mount } from '@vue/test-utils';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppearanceSettingsDrawer from '../src/components/AppearanceSettingsDrawer.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

const site = {
  id: 1,
  userId: 1,
  name: 'NoNo',
  description: '导航',
  slug: 'admin',
  backgroundColor: '#090a0f',
  fontColor: '#ffffff',
  searchUrlTemplate: 'https://www.google.com/search?q={query}',
  localSearchFirst: true,
  settings: { analytics: { enabled: true } },
};

describe('AppearanceSettingsDrawer', () => {
  beforeEach(() => apiRequest.mockReset());

  it('combines theme and general preferences into one compact appearance panel', () => {
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });
    const tabs = wrapper.findAll('.drawer-tab');

    expect(tabs).toHaveLength(2);
    expect(wrapper.find('[data-testid="drawer-tab-general"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="drawer-tab-theme"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.get('[data-testid="theme-winter-glow"]').isVisible()).toBe(true);
    expect(wrapper.get('[data-testid="site-locale-zh"]').isVisible()).toBe(true);
    expect(wrapper.getComponent({ name: 'ColorModeControl' }).isVisible()).toBe(true);
    expect(wrapper.getComponent({ name: 'LanguageControl' }).isVisible()).toBe(true);
  });

  it('pins grid content to the top instead of stretching cards across the drawer', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AppearanceSettingsDrawer.vue'), 'utf8');

    expect(source).toMatch(/\.drawer-scroll \{[\s\S]*?align-content:\s*start/);
    expect(source).toMatch(/\.drawer-panel \{[\s\S]*?align-content:\s*start/);
    expect(source).toMatch(/\.drawer-tabs \{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  });

  it('applies and saves a complete theme without dropping unrelated settings', async () => {
    apiRequest.mockResolvedValue({ ...site, backgroundColor: '#cfdcee', fontColor: '#3a3029' });
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });

    expect(wrapper.findAll('[data-testid^="theme-"]')).toHaveLength(6);
    await wrapper.get('[data-testid="theme-winter-glow"]').trigger('click');
    // The editor is generated from the schema, so a control is addressed by its setting key.
    const colorInput = (key: string) =>
      wrapper.get(`[data-testid="control-${key}"] input[type="color"]`).element as HTMLInputElement;
    expect(colorInput('cardColor').value).toBe('#fffaf3');
    expect(colorInput('searchColor').value).toBe('#fffdf8');
    await wrapper.get('[data-testid="appearance-save"]').trigger('click');
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    const [url, options] = apiRequest.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(url).toBe('/api/admin/site');
    expect(options.method).toBe('PUT');
    expect(payload.backgroundColor).toBe('#cfdcee');
    expect(payload.fontColor).toBe('#3a3029');
    expect(payload.settings.analytics).toEqual({ enabled: true });
    expect(payload.settings.theme).toEqual({ id: 'winter-glow', accent: '#c8622f', sceneIntensity: 100 });
    expect(payload.settings.appearance).toMatchObject({
      cardColor: '#fffaf3',
      searchColor: '#fffdf8',
      bookmarkTextColor: '#3f352f',
      notabTextColor: '#4a3f38',
      folderTextColor: '#493a32',
    });
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });

  it('keeps the admin jump inside the drawer and opens it in a new window', () => {
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });
    const link = wrapper.get('[data-testid="appearance-admin-link"]');

    expect(link.attributes('href')).toBe('/admin');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noreferrer');
  });

  it('restores and persists the scene intensity dial next to the theme wall', async () => {
    apiRequest.mockResolvedValue(site);
    const savedSite = { ...site, settings: { ...site.settings, theme: { id: 'starlit-night', accent: '#f0b86e', sceneIntensity: 60 } } };
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site: savedSite } });

    const dial = wrapper.get('[data-testid="scene-intensity"]');
    expect((dial.element as HTMLInputElement).value).toBe('60');

    await dial.setValue('0');
    expect(wrapper.get('[data-testid="scene-intensity-field"]').text()).toContain('已关闭');

    await dial.setValue('40');
    await wrapper.get('[data-testid="appearance-save"]').trigger('click');
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    const payload = JSON.parse(apiRequest.mock.calls[0][1].body);
    expect(payload.settings.theme).toMatchObject({ id: 'starlit-night', sceneIntensity: 40 });
  });

  it('persists up to three named user presets', async () => {
    apiRequest.mockResolvedValue(site);
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });

    for (const name of ['工作', '阅读', '夜间']) {
      await wrapper.get('[data-testid="appearance-preset-name"]').setValue(name);
      await wrapper.get('[data-testid="save-appearance-preset"]').trigger('submit');
      await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(['工作', '阅读', '夜间'].indexOf(name) + 1));
    }

    const payload = JSON.parse(apiRequest.mock.calls[2][1].body);
    expect(payload.settings.appearancePresets).toHaveLength(3);
    expect(payload.settings.appearancePresets.map((preset: { name: string }) => preset.name)).toEqual(['工作', '阅读', '夜间']);
    expect(wrapper.get('[data-testid="appearance-preset-name"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="save-appearance-preset-button"]').attributes('disabled')).toBeDefined();
  });

  it('restores scene intensity from a saved user preset', async () => {
    const savedSite = {
      ...site,
      settings: {
        ...site.settings,
        appearancePresets: [{
          id: 'quiet-rain',
          name: '小雨',
          appearance: {},
          theme: { id: 'rainy-world', accent: '#367c87', sceneIntensity: 35 },
          backgroundColor: '#c7d4d2',
          fontColor: '#172d31',
        }],
      },
    };
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site: savedSite } });

    await wrapper.get('.user-preset-apply').trigger('click');
    expect((wrapper.get('[data-testid="scene-intensity"]').element as HTMLInputElement).value).toBe('35');
  });

  it('prevents horizontal drawer scrolling and gives text controls responsive width', () => {
    const drawerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AppearanceSettingsDrawer.vue'), 'utf8');
    const editorSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/AppearanceEditor.vue'), 'utf8');

    expect(drawerSource).toMatch(/\.drawer-scroll \{[\s\S]*?overflow-x:\s*hidden/);
    expect(drawerSource).toContain('width: min(512px, 100vw)');
    expect(editorSource).not.toContain('setting-scope');
    expect(editorSource).toMatch(/::-webkit-slider-runnable-track \{[\s\S]*?height:\s*3px/);
    expect(editorSource).toMatch(/::-webkit-slider-thumb \{[\s\S]*?height:\s*13px/);
  });
});

describe('appearance header actions', () => {
  beforeEach(() => apiRequest.mockReset());

  it('puts Admin, Save, and Close in the header and drops the bottom bar', () => {
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });
    const header = wrapper.get('.drawer-header');

    expect(header.find('[data-testid="appearance-admin-link"]').exists()).toBe(true);
    expect(header.find('[data-testid="appearance-save"]').exists()).toBe(true);
    expect(header.find('.drawer-icon-button').exists()).toBe(true);
    // The bottom action bar is gone, so the controls get that height back.
    expect(wrapper.find('.drawer-footer').exists()).toBe(false);
    // Save is the primary action, Admin the secondary one.
    expect(wrapper.get('[data-testid="appearance-save"]').classes()).toContain('header-primary');
    expect(wrapper.get('[data-testid="appearance-admin-link"]').classes()).toContain('header-secondary');
  });

  it('disables Save until something actually changes, then flags it as unsaved', async () => {
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });
    const saveButton = () => wrapper.get('[data-testid="appearance-save"]');

    expect(saveButton().attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="appearance-unsaved"]').exists()).toBe(false);

    await wrapper.get('[data-testid="theme-winter-glow"]').trigger('click');
    expect(saveButton().attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[data-testid="appearance-unsaved"]').text()).toBe('有未保存的改动');
  });

  it('shows a brief confirmation after saving and goes clean again', async () => {
    apiRequest.mockResolvedValue(site);
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });

    await wrapper.get('[data-testid="theme-winter-glow"]').trigger('click');
    await wrapper.get('[data-testid="appearance-save"]').trigger('click');
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.drawer-header').text()).toContain('外观已保存');
    // Saving re-establishes the baseline, so the drawer is clean and Save is inert again.
    expect(wrapper.find('[data-testid="appearance-unsaved"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="appearance-save"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="control-folderColumns"] input[type="range"]').setValue('5');
    expect(wrapper.get('.drawer-header').text()).not.toContain('外观已保存');
    expect(wrapper.get('[data-testid="appearance-unsaved"]').text()).toBe('有未保存的改动');
  });

  it('asks before closing with unsaved changes and respects the answer', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });

    // Clean: closes without asking.
    await wrapper.get('.drawer-icon-button').trigger('click');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')).toHaveLength(1);

    await wrapper.get('[data-testid="theme-winter-glow"]').trigger('click');
    confirmSpy.mockReturnValue(false);
    await wrapper.get('.drawer-icon-button').trigger('click');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Declining keeps the drawer open.
    expect(wrapper.emitted('close')).toHaveLength(1);

    confirmSpy.mockReturnValue(true);
    await wrapper.get('.drawer-icon-button').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);
    confirmSpy.mockRestore();
  });

  it('keeps the header sticky and the mobile row at a 44px touch target', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AppearanceSettingsDrawer.vue'), 'utf8');

    expect(source).toMatch(/\.drawer-header \{[\s\S]*?position:\s*sticky/);
    expect(source).toMatch(/\.drawer-header \{[\s\S]*?top:\s*0/);
    // Title on row one, the three controls on a compact row two.
    expect(source).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.drawer-header \{[\s\S]*?flex-direction:\s*column/);
    expect(source).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.header-actions \{[\s\S]*?grid-template-columns:\s*1fr 1fr 44px/);
    // `.drawer-header span` is more specific than a bare `.save-state`; the mobile override must
    // win or this invisible status span consumes the first grid cell and wraps Close to row two.
    expect(source).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.header-actions > \.save-state \{[\s\S]*?display:\s*none/);
    expect(source).toMatch(/min-height:\s*44px/);
  });
});

describe('schema-driven appearance editor', () => {
  beforeEach(() => apiRequest.mockReset());

  /**
   * The editor lives in the drawer's second tab, and the panels stay mounted behind `v-show`, so
   * the tab has to be opened before anything inside it counts as visible.
   */
  async function openEditor() {
    const wrapper = mount(AppearanceSettingsDrawer, { props: { open: true, site } });
    await wrapper.get('[data-testid="drawer-tab-texture"]').trigger('click');
    return wrapper;
  }

  const mountDrawer = () => mount(AppearanceSettingsDrawer, { props: { open: true, site } });
  const rangeOf = (wrapper: ReturnType<typeof mountDrawer>, key: string) =>
    wrapper.get('[data-testid="control-' + key + '"] input[type="range"]');
  const rangeValue = (wrapper: ReturnType<typeof mountDrawer>, key: string) =>
    (rangeOf(wrapper, key).element as HTMLInputElement).value;

  it('renders a section per group with the advanced controls folded away', async () => {
    const wrapper = await openEditor();

    for (const group of ['layout', 'folders', 'search', 'glass', 'background', 'scene', 'typography']) {
      expect(wrapper.find('[data-testid="appearance-group-' + group + '"]').exists(), group).toBe(true);
    }
    // A common control is visible; an advanced one is rendered but hidden until expanded.
    expect(wrapper.get('[data-testid="control-folderColumns"]').isVisible()).toBe(true);
    expect(wrapper.get('[data-testid="control-hoverScale"]').isVisible()).toBe(false);
  });

  it('expands an advanced block on demand', async () => {
    const wrapper = await openEditor();

    await wrapper.get('[data-testid="appearance-advanced-folders"]').trigger('click');
    expect(wrapper.get('[data-testid="control-hoverScale"]').isVisible()).toBe(true);
  });

  it('filters controls by search and reports when nothing matches', async () => {
    const wrapper = await openEditor();

    await wrapper.get('[data-testid="appearance-search"]').setValue('列数');
    expect(wrapper.find('[data-testid="control-folderColumns"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="control-cardBlur"]').exists()).toBe(false);

    // Search reaches advanced controls too, without needing them expanded first.
    await wrapper.get('[data-testid="appearance-search"]').setValue('悬停放大');
    expect(wrapper.get('[data-testid="control-hoverScale"]').isVisible()).toBe(true);

    await wrapper.get('[data-testid="appearance-search"]').setValue('zzzz');
    expect(wrapper.find('[data-testid="appearance-search-empty"]').exists()).toBe(true);
  });

  it('marks a modified control as changed and counts it on the group', async () => {
    const wrapper = mountDrawer();

    expect(wrapper.get('[data-testid="control-folderColumns"]').attributes('data-changed')).toBeUndefined();
    await rangeOf(wrapper, 'folderColumns').setValue('6');

    expect(wrapper.get('[data-testid="control-folderColumns"]').attributes('data-changed')).toBe('true');
    expect(wrapper.get('[data-testid="appearance-group-layout"]').text()).toContain('已改 1 项');
  });

  it('resets one group without touching another', async () => {
    const wrapper = mountDrawer();

    await rangeOf(wrapper, 'folderColumns').setValue('6');
    await rangeOf(wrapper, 'cardBlur').setValue('4');

    await wrapper.get('[data-testid="appearance-reset-layout"]').trigger('click');
    expect(rangeValue(wrapper, 'folderColumns')).toBe('4');
    // The folders group keeps its edit.
    expect(rangeValue(wrapper, 'cardBlur')).toBe('4');
  });

  it('resets everything only after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mountDrawer();

    await rangeOf(wrapper, 'folderColumns').setValue('6');
    await wrapper.get('[data-testid="appearance-reset-all"]').trigger('click');
    expect(rangeValue(wrapper, 'folderColumns')).toBe('6');

    confirmSpy.mockReturnValue(true);
    await wrapper.get('[data-testid="appearance-reset-all"]').trigger('click');
    expect(rangeValue(wrapper, 'folderColumns')).toBe('4');
    confirmSpy.mockRestore();
  });

  it('applies a density preset while leaving the values adjustable', async () => {
    const wrapper = mountDrawer();

    await wrapper.get('[data-testid="density-compact"]').trigger('click');
    expect(rangeValue(wrapper, 'folderGapX')).toBe('12');

    // A preset is a starting point, not a lock.
    await rangeOf(wrapper, 'folderGapX').setValue('40');
    expect(rangeValue(wrapper, 'folderGapX')).toBe('40');
  });

  it('only offers the scene controls the selected scene uses', async () => {
    const wrapper = mountDrawer();

    // Verdant Leaves: leaves neither collide nor splash.
    await wrapper.get('[data-testid="theme-verdant-leaves"]').trigger('click');
    await wrapper.get('[data-testid="appearance-advanced-scene"]').trigger('click');
    expect(wrapper.find('[data-testid="control-sceneCollision"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="control-sceneSplash"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="control-sceneWind"]').exists()).toBe(true);

    // Starlit Night: stars hold position, so wind is meaningless too.
    await wrapper.get('[data-testid="theme-starlit-night"]').trigger('click');
    expect(wrapper.find('[data-testid="control-sceneCollision"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="control-sceneWind"]').exists()).toBe(false);

    // Rainy World is the one scene that collides.
    await wrapper.get('[data-testid="theme-rainy-world"]').trigger('click');
    expect(wrapper.find('[data-testid="control-sceneCollision"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="control-sceneSplash"]').exists()).toBe(true);
  });

  it('resets hidden scene-specific values when resetting the scene group', async () => {
    const wrapper = mountDrawer();
    await wrapper.get('[data-testid="theme-rainy-world"]').trigger('click');
    await wrapper.get('[data-testid="appearance-advanced-scene"]').trigger('click');
    await rangeOf(wrapper, 'sceneCollision').setValue('50');

    await wrapper.get('[data-testid="theme-winter-glow"]').trigger('click');
    await wrapper.get('[data-testid="appearance-reset-scene"]').trigger('click');
    await wrapper.get('[data-testid="theme-rainy-world"]').trigger('click');

    expect(rangeValue(wrapper, 'sceneCollision')).toBe('100');
  });

  it('wires the folder title gap setting to the folder component', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');
    expect(source).toMatch(/gap:\s*var\(--public-folder-title-gap,\s*\d+px\)/);
  });

  it('saves every new setting group in the payload', async () => {
    apiRequest.mockResolvedValue(site);
    const wrapper = mountDrawer();

    await rangeOf(wrapper, 'folderColumns').setValue('5');
    await rangeOf(wrapper, 'searchHeight').setValue('64');
    await wrapper.get('[data-testid="appearance-save"]').trigger('click');
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    const payload = JSON.parse(apiRequest.mock.calls[0][1].body);
    expect(payload.settings.appearance).toMatchObject({
      folderColumns: 5,
      searchHeight: 64,
      density: 'balanced',
      notabAlign: 'center',
      backgroundImageEnabled: true,
      sceneEnabled: true,
      fontFamily: 'system',
    });
  });
});
