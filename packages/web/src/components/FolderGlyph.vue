<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Bookmark, Code2, Folder, Globe2, Lock, Sparkles, Star, Wrench } from 'lucide-vue-next';

const props = withDefaults(defineProps<{ icon?: string | null; size?: number }>(), {
  icon: '',
  size: 18,
});

const semanticIcons: Record<string, Component> = {
  bookmark: Bookmark,
  code: Code2,
  code2: Code2,
  folder: Folder,
  globe: Globe2,
  lock: Lock,
  sparkles: Sparkles,
  star: Star,
  toolbox: Wrench,
  tools: Wrench,
};

const normalizedIcon = computed(() => props.icon?.trim() || '');
const semanticIcon = computed(() => semanticIcons[normalizedIcon.value.toLocaleLowerCase()] || (!normalizedIcon.value ? Folder : null));
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
