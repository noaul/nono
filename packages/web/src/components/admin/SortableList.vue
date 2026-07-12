<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Sortable, { type SortableEvent } from 'sortablejs';

const props = withDefaults(defineProps<{
  disabled?: boolean;
  ariaLabel?: string;
}>(), {
  disabled: false,
  ariaLabel: '可拖动排序列表',
});

const emit = defineEmits<{
  reorder: [ids: number[]];
}>();

const root = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;

function handleEnd(event: SortableEvent) {
  const oldIndex = event.oldIndex;
  const newIndex = event.newIndex;
  if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;

  const ids = sortable?.toArray().map(Number).filter(Number.isInteger) || [];
  if (!ids.length) return;
  emit('reorder', ids);
}

onMounted(() => {
  if (!root.value) return;
  sortable = Sortable.create(root.value, {
    animation: 100,
    dataIdAttr: 'data-id',
    draggable: '.sortable-admin-row',
    handle: '.drag-handle',
    ghostClass: 'sortable-row-ghost',
    chosenClass: 'sortable-row-chosen',
    dragClass: 'sortable-row-dragging',
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    delay: 120,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    fallbackTolerance: 4,
    disabled: props.disabled,
    onEnd: handleEnd,
  });
});

watch(() => props.disabled, (disabled) => {
  sortable?.option('disabled', disabled);
});

onBeforeUnmount(() => {
  sortable?.destroy();
  sortable = null;
});
</script>

<template>
  <div ref="root" class="sortable-list" role="list" :aria-label="ariaLabel">
    <slot />
  </div>
</template>
