import { mount } from '@vue/test-utils';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SortableList from '../src/components/admin/SortableList.vue';

const sortableMocks = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
  option: vi.fn(),
  toArray: vi.fn(),
}));

vi.mock('sortablejs', () => ({
  default: {
    create: sortableMocks.create,
  },
}));

describe('SortableList', () => {
  beforeEach(() => {
    sortableMocks.create.mockReset();
    sortableMocks.destroy.mockReset();
    sortableMocks.option.mockReset();
    sortableMocks.toArray.mockReset();
    sortableMocks.toArray.mockReturnValue(['3', '1', '2']);
    sortableMocks.create.mockReturnValue({
      destroy: sortableMocks.destroy,
      option: sortableMocks.option,
      toArray: sortableMocks.toArray,
    });
  });

  it('emits the final DOM order once after dragging through a dedicated handle', async () => {
    const wrapper = mount(SortableList, {
      slots: {
        default: `
          <article data-id="1"><button class="drag-handle">Drag</button></article>
          <article data-id="2"><button class="drag-handle">Drag</button></article>
          <article data-id="3"><button class="drag-handle">Drag</button></article>
        `,
      },
    });

    expect(sortableMocks.create).toHaveBeenCalledOnce();
    const options = sortableMocks.create.mock.calls[0][1];
    expect(options).toMatchObject({
      animation: 100,
      dataIdAttr: 'data-id',
      draggable: '.sortable-admin-row',
      handle: '.drag-handle',
      ghostClass: 'sortable-row-ghost',
      chosenClass: 'sortable-row-chosen',
      dragClass: 'sortable-row-dragging',
      forceFallback: false,
      fallbackOnBody: true,
      swapThreshold: 0.65,
      invertSwap: true,
    });

    options.onStart();
    await wrapper.vm.$nextTick();
    expect(wrapper.attributes('data-dragging')).toBe('true');

    options.onEnd({ oldIndex: 0, newIndex: 2 });
    await wrapper.vm.$nextTick();
    expect(sortableMocks.toArray).toHaveBeenCalledOnce();
    expect(wrapper.emitted('reorder')).toEqual([[[3, 1, 2]]]);
    expect(wrapper.attributes('data-dragging')).toBe('false');

    wrapper.unmount();
    expect(sortableMocks.destroy).toHaveBeenCalledOnce();
  });

  it('disables expensive row effects while a drag is active', () => {
    const css = fs.readFileSync('src/styles.css', 'utf8');

    expect(css).toContain(".sortable-list[data-dragging='true'] .sortable-admin-row");
    expect(css).toMatch(/sortable-list\[data-dragging='true'\][\s\S]*?transition:\s*none/);
    expect(css).toMatch(/sortable-row-dragging[\s\S]*?backdrop-filter:\s*none/);
    expect(css).toMatch(/sortable-row-chosen[\s\S]*?contain:\s*paint/);
  });
});
