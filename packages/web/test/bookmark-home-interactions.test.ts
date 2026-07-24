import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FolderCard from '../src/components/FolderCard.vue';

const folder = {
  id: 2,
  userId: 1,
  parentId: 1,
  name: '常用',
  sortOrder: 100,
  locked: false,
  links: [
    { id: 10, folderId: 2, name: 'Vue', url: 'https://vuejs.org/', sortOrder: 100 },
  ],
};

function pointerEvent(type: string, init: { pointerId: number; clientX: number; clientY: number; button?: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: init.button ?? 0,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId });
  return event;
}

describe('homepage bookmark long press', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('arms dragging after one second and starts when the pointer moves', async () => {
    const wrapper = mount(FolderCard, { props: { folder, editable: true } });
    const bookmark = wrapper.get('[data-testid="public-bookmark-10"]');

    bookmark.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 7, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(1000);
    await wrapper.vm.$nextTick();
    expect(bookmark.classes()).toContain('is-drag-armed');

    bookmark.element.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 42, clientY: 20 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('bookmark-drag-start')).toHaveLength(1);
    expect(wrapper.emitted('bookmark-delete-request')).toBeUndefined();
  });

  it('requests deletion after three seconds without movement', async () => {
    const wrapper = mount(FolderCard, { props: { folder, editable: true } });
    const bookmark = wrapper.get('[data-testid="public-bookmark-10"]');

    bookmark.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 8, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(wrapper.emitted('bookmark-delete-request')).toHaveLength(1);
    expect(wrapper.emitted('bookmark-drag-start')).toBeUndefined();
  });

  it('keeps long-press actions disabled for signed-out visitors', async () => {
    const wrapper = mount(FolderCard, { props: { folder, editable: false } });
    const bookmark = wrapper.get('[data-testid="public-bookmark-10"]');

    bookmark.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 9, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(wrapper.emitted('bookmark-delete-request')).toBeUndefined();
    expect(wrapper.emitted('bookmark-drag-start')).toBeUndefined();
  });
});
