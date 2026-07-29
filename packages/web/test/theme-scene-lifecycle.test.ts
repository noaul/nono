import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeScene from '../src/components/ThemeScene.vue';
import { getTheme } from '../src/utils/themes';

describe('ThemeScene lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes the canvas when an asynchronously loaded theme arrives after mount', async () => {
    const wrapper = mount(ThemeScene, { props: { intensity: 100 } });

    expect(wrapper.find('[data-testid="scene-canvas"]').exists()).toBe(false);

    await wrapper.setProps({ theme: getTheme('rainy-world') });
    const canvas = wrapper.get('[data-testid="scene-canvas"]').element as HTMLCanvasElement;

    expect(canvas.width).toBe(window.innerWidth);
    expect(canvas.height).toBe(window.innerHeight);

    wrapper.unmount();
  });
});
