import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SortableList from '../src/components/admin/SortableList.vue';

const sortableMocks = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
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
    sortableMocks.create.mockReturnValue({ destroy: sortableMocks.destroy });
  });

  it('reorders ids locally through a dedicated drag handle', async () => {
    const wrapper = mount(SortableList, {
      props: { itemIds: [1, 2, 3] },
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
      animation: 160,
      handle: '.drag-handle',
      ghostClass: 'sortable-row-ghost',
      chosenClass: 'sortable-row-chosen',
      dragClass: 'sortable-row-dragging',
    });

    options.onEnd({ oldIndex: 0, newIndex: 2 });
    expect(wrapper.emitted('reorder')?.[0]).toEqual([[2, 3, 1]]);

    wrapper.unmount();
    expect(sortableMocks.destroy).toHaveBeenCalledOnce();
  });
});
