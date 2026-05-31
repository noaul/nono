<script setup lang="ts">
import { Search } from 'lucide-vue-next';

defineProps<{ modelValue: string; placeholder?: string }>();
defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>();
</script>

<template>
  <form class="search-bar" @submit.prevent="$emit('submit')">
    <Search :size="20" />
    <input :value="modelValue" :placeholder="placeholder || '搜索站内链接或使用 Google'" @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
  </form>
</template>

<style scoped>
.search-bar {
  align-items: center;
  backdrop-filter: blur(18px);
  background: rgba(10, 14, 20, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  display: flex;
  gap: 10px;
  min-height: 52px;
  padding: 0 16px;
}

.search-bar input {
  background: transparent;
  border: 0;
  color: #fff;
  flex: 1;
  min-width: 0;
  outline: 0;
}
</style>
