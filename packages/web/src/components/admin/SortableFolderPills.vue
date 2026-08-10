<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Sortable, { type SortableEvent } from 'sortablejs';

defineOptions({ name: 'SortableFolderPills' });

const props = withDefaults(defineProps<{
  disabled?: boolean;
  ariaLabel?: string;
}>(), {
  disabled: false,
  ariaLabel: '',
});

const emit = defineEmits<{
  reorder: [ids: number[]];
}>();

const root = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;

function handleEnd(event: SortableEvent) {
  if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return;
  const ids = sortable?.toArray().map(Number).filter(Number.isInteger) || [];
  if (ids.length > 1) emit('reorder', ids);
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled || !event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || !root.value) return;
  const pill = (event.target as HTMLElement).closest<HTMLElement>('.sortable-folder-pill');
  if (!pill || !root.value.contains(pill)) return;

  const pills = Array.from(root.value.querySelectorAll<HTMLElement>('.sortable-folder-pill'));
  const currentIndex = pills.indexOf(pill);
  const targetIndex = currentIndex + (event.key === 'ArrowLeft' ? -1 : 1);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= pills.length) return;

  event.preventDefault();
  const target = pills[targetIndex];
  if (event.key === 'ArrowLeft') root.value.insertBefore(pill, target);
  else root.value.insertBefore(pill, target.nextSibling);
  pill.focus();

  const ids = Array.from(root.value.querySelectorAll<HTMLElement>('.sortable-folder-pill'))
    .map((item) => Number(item.dataset.id))
    .filter(Number.isInteger);
  if (ids.length > 1) emit('reorder', ids);
}

onMounted(() => {
  if (!root.value) return;
  sortable = Sortable.create(root.value, {
    animation: 100,
    dataIdAttr: 'data-id',
    draggable: '.sortable-folder-pill',
    handle: '.sortable-folder-pill',
    direction: 'horizontal',
    ghostClass: 'sortable-folder-pill-ghost',
    chosenClass: 'sortable-folder-pill-chosen',
    dragClass: 'sortable-folder-pill-dragging',
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 3,
    swapThreshold: 0.6,
    delay: 140,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
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
  <div ref="root" class="sortable-folder-pills" role="group" :aria-label="ariaLabel" @keydown="handleKeydown">
    <slot />
  </div>
</template>
