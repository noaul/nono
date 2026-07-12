<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="admin-empty-state">
    <svg class="empty-illustration" width="72" height="56" viewBox="0 0 72 56" fill="none" aria-hidden="true">
      <rect x="10" y="14" width="52" height="36" rx="6" fill="currentColor" opacity="0.08" />
      <rect x="10" y="14" width="52" height="36" rx="6" stroke="currentColor" opacity="0.35" stroke-width="1.5" />
      <path d="M10 24h18l4 5h20" stroke="currentColor" opacity="0.45" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="22" y="6" width="28" height="8" rx="3" fill="currentColor" opacity="0.14" />
      <circle cx="36" cy="38" r="6.5" stroke="currentColor" opacity="0.5" stroke-width="1.5" />
      <path d="M41 43l4 4" stroke="currentColor" opacity="0.5" stroke-width="1.5" stroke-linecap="round" />
    </svg>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <div v-if="$slots.action" class="admin-empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty-illustration {
  color: currentColor;
}
</style>
