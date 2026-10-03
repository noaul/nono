import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { closeTopLayer, connectMobileShell, resetMobileShellForTests, useMobileBackLayer } from '../src/mobile/back-layers';

function withLayer(open: () => boolean, close: () => void) {
  return defineComponent({ setup() { useMobileBackLayer(open, close); return () => h('div'); } });
}

describe('mobile back layers', () => {
  afterEach(() => {
    resetMobileShellForTests();
    delete (globalThis as { NonoBridge?: unknown }).NonoBridge;
  });

  it('closes the newest open layer first and reports when none are left', async () => {
    const sent: any[] = [];
    (globalThis as { NonoBridge?: unknown }).NonoBridge = { postMessage: (data: string) => sent.push(JSON.parse(data)), addEventListener: () => {} };
    connectMobileShell();
    const closed: string[] = [];
    const drawerOpen = ref(true);
    const drawer = mount(withLayer(() => drawerOpen.value, () => { closed.push('drawer'); drawerOpen.value = false; }));
    const dialog = mount(withLayer(() => true, () => closed.push('dialog')));

    expect(sent.filter((message) => message.type === 'ui.backState').map((message) => message.payload.canHandle)).toEqual([true]);
    expect(closeTopLayer()).toBe(true);
    dialog.unmount();
    expect(closeTopLayer()).toBe(true);
    await nextTick();
    expect(closeTopLayer()).toBe(false);
    expect(closed).toEqual(['dialog', 'drawer']);
    expect(sent.filter((message) => message.type === 'ui.backState').at(-1).payload.canHandle).toBe(false);
    drawer.unmount();
  });

  it('does nothing outside the Android app', () => {
    expect(connectMobileShell()).toBeNull();
    expect(closeTopLayer()).toBe(false);
  });
});
