<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ name?: string; url?: string; size?: number }>(), { name: '', url: '', size: 18 });

function hashString(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const domain = computed(() => {
  try {
    return new URL(props.url).hostname;
  } catch {
    return props.url || props.name;
  }
});

const initial = computed(() => (props.name.trim().charAt(0) || domain.value.charAt(0) || '·').toUpperCase());

const style = computed(() => {
  const hue = hashString(domain.value) % 360;
  const hue2 = (hue + 42) % 360;
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    fontSize: `${Math.round(props.size * 0.55)}px`,
    background: `linear-gradient(135deg, hsl(${hue} 55% 46%), hsl(${hue2} 60% 34%))`,
  };
});
</script>

<template>
  <span class="favicon-badge" aria-hidden="true" :style="style">{{ initial }}</span>
</template>

<style scoped>
.favicon-badge {
  align-items: center;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.94);
  display: inline-flex;
  flex-shrink: 0;
  font-weight: 800;
  justify-content: center;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  user-select: none;
}
</style>
