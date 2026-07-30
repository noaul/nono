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

  it('can opt out of reduced motion and reacts when the option changes', async () => {
    const raf = vi.mocked(requestAnimationFrame);
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const wrapper = mount(ThemeScene, {
      props: { theme: getTheme('rainy-world'), tuning: { followReducedMotion: true } as any },
    });
    await wrapper.vm.$nextTick();
    expect(raf).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="theme-scene"]').classes()).toContain('is-reduced-motion');

    await wrapper.setProps({ tuning: { followReducedMotion: false } as any });
    expect(raf).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="theme-scene"]').classes()).not.toContain('is-reduced-motion');
    wrapper.unmount();
  });

  it('removes the whole scene treatment when the scene is disabled', () => {
    const wrapper = mount(ThemeScene, {
      props: { theme: getTheme('rainy-world'), tuning: { enabled: false } as any },
    });
    expect(wrapper.get('[data-testid="theme-scene"]').attributes('style')).toContain('--theme-scene-opacity: 0');
    expect(wrapper.get('[data-testid="theme-scene"]').attributes('style')).toContain('--theme-ambient-opacity: 0');
    wrapper.unmount();
  });
});
