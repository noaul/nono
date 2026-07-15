<script setup lang="ts">
import { computed } from 'vue';
import { Folder } from 'lucide-vue-next';
import { getFolderIconOption } from '@/utils/folder-icons';

const props = withDefaults(defineProps<{ icon?: string | null; size?: number }>(), {
  icon: '',
  size: 18,
});

const normalizedIcon = computed(() => props.icon?.trim() || '');
const semanticIcon = computed(() => getFolderIconOption(normalizedIcon.value)?.component || (!normalizedIcon.value ? Folder : null));
</script>

<template>
  <component v-if="semanticIcon" :is="semanticIcon" :size="size" :stroke-width="2.1" aria-hidden="true" />
  <span v-else aria-hidden="true">{{ normalizedIcon }}</span>
</template>

<style scoped>
svg,
span {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
}
</style>
