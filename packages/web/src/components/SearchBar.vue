<script setup lang="ts">
import { Search } from 'lucide-vue-next';

defineProps<{ modelValue: string; placeholder?: string }>();
defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>();
</script>

<template>
  <form class="search-bar" @submit.prevent="$emit('submit')">
    <span class="search-provider">G</span>
    <input :value="modelValue" :placeholder="placeholder || '想要搜点什么'" @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
    <button type="submit" title="搜索"><Search :size="24" /></button>
  </form>
</template>

<style scoped>
.search-bar {
  align-items: center;
  backdrop-filter: blur(4px);
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  display: flex;
  gap: 16px;
  min-height: 52px;
  margin: 0 auto;
  max-width: 840px;
  overflow: hidden;
  padding: 0 10px 0 22px;
  width: 100%;
}

.search-provider {
  color: #fff;
  flex: 0 0 auto;
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
}

.search-bar input {
  background: transparent;
  border: 0;
  color: #fff;
  flex: 1;
  min-width: 0;
  outline: 0;
}

.search-bar button {
  align-self: stretch;
  background: transparent;
  border: 0;
  color: #fff;
  display: grid;
  font-weight: 800;
  min-width: 48px;
  place-items: center;
}
</style>
