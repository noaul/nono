<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Sortable, { type SortableEvent } from 'sortablejs';
import { useI18n } from '@/composables/useI18n';

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

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
const dragging = ref(false);
let sortable: Sortable | null = null;

function handleStart() {
  dragging.value = true;
}

function handleEnd(event: SortableEvent) {
  dragging.value = false;
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
    animation: 80,
    dataIdAttr: 'data-id',
    draggable: '.sortable-admin-row',
    handle: '.drag-handle',
    ghostClass: 'sortable-row-ghost',
    chosenClass: 'sortable-row-chosen',
    dragClass: 'sortable-row-dragging',
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 3,
    swapThreshold: 0.55,
    invertSwap: false,
    emptyInsertThreshold: 8,
    delay: 120,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    disabled: props.disabled,
    onStart: handleStart,
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
  <div ref="root" class="sortable-list" role="list" :aria-label="ariaLabel || t('ui.sortableList')" :data-dragging="String(dragging)">
    <slot />
  </div>
</template>
