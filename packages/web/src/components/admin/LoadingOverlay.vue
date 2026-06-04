<script setup lang="ts">
defineProps<{
  label?: string;
}>();
</script>

<template>
  <div class="loading-overlay" role="status" aria-live="polite">
    <span class="loading-spinner" aria-hidden="true"></span>
    <span>{{ label || '正在加载' }}</span>
  </div>
</template>
