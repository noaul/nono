// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import SearchBar from '../src/components/SearchBar.vue';
import { getSearchEngineSettings } from '../src/utils/searchEngines';

const store = new Map<string, string>();
let wrapper: VueWrapper | null = null;

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  });
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function mountBar(modelValue = '') {
  wrapper = mount(SearchBar, {
    props: {
      modelValue,
      searchEngines: getSearchEngineSettings(undefined, 'https://www.google.com/search?q={query}'),
    },
    attachTo: document.body,
  });
  return wrapper;
}

describe('SearchBar engine picker', () => {
  it('shows each engine favicon and translates the built-in site default', async () => {
    const bar = mountBar();
    await bar.get('[data-testid="engine-trigger"]').trigger('click');
    await nextTick();

    const options = bar.findAll('.engine-option');
    expect(options.map((option) => option.get('.engine-name').text())).toEqual(['站点默认', 'Google', 'Bing', '百度', 'DuckDuckGo']);
    // The site default resolves to the site's own template, so it carries that engine's icon.
    expect(options[0].get('img').attributes('src')).toBe('/api/favicon?domain=www.google.com');
    expect(options[2].get('img').attributes('src')).toBe('/api/favicon?domain=www.bing.com');
  });

  it('falls back to the short mark when an engine icon cannot load', async () => {
    const bar = mountBar();
    await bar.get('[data-testid="engine-trigger"]').trigger('click');
    await nextTick();

    await bar.findAll('.engine-option')[2].get('img').trigger('error');
    expect(bar.findAll('.engine-option')[2].find('img').exists()).toBe(false);
    expect(bar.findAll('.engine-option')[2].get('.engine-mark').text()).toBe('B');
  });

  it('opens from the keyboard on the selected engine and moves with the arrow keys', async () => {
    localStorage.setItem('nono:search-engine', 'google');
    const bar = mountBar();
    const trigger = bar.get('[data-testid="engine-trigger"]');

    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect(document.activeElement?.id).toBe('engine-google');

    await bar.get('.engine-menu').trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement?.id).toBe('engine-bing');
    await bar.get('.engine-menu').trigger('keydown', { key: 'End' });
    expect(document.activeElement?.id).toBe('engine-duckduckgo');
    await bar.get('.engine-menu').trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement?.id).toBe('engine-default');

    await bar.get('.engine-menu').trigger('keydown', { key: 'Escape' });
    expect(bar.find('.engine-menu').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
  });

  it('persists a picked engine and hands focus back to the input', async () => {
    const bar = mountBar();
    await bar.get('[data-testid="engine-trigger"]').trigger('click');
    await nextTick();
    await bar.get('#engine-bing').trigger('click');

    expect(localStorage.getItem('nono:search-engine')).toBe('bing');
    expect(bar.emitted('engine-change')).toEqual([['bing']]);
    expect(document.activeElement).toBe(bar.get('input').element);
  });
});

describe('SearchBar query controls', () => {
  it('swaps the shortcut hint for a themed clear button once there is a query', async () => {
    const bar = mountBar();
    expect(bar.find('.search-kbd').exists()).toBe(true);
    expect(bar.find('[data-testid="search-clear"]').exists()).toBe(false);

    await bar.setProps({ modelValue: 'nono' });
    expect(bar.find('.search-kbd').exists()).toBe(false);
    await bar.get('[data-testid="search-clear"]').trigger('click');

    expect(bar.emitted('update:modelValue')).toEqual([['']]);
    expect(document.activeElement).toBe(bar.get('input').element);
  });
});
