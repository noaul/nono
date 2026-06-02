<script setup lang="ts">
import { Search } from 'lucide-vue-next';

defineProps<{ modelValue: string; placeholder?: string }>();
defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>();
</script>

<template>
  <form class="search-bar" @submit.prevent="$emit('submit')">
    <div class="search-provider-badge">G</div>
    <input 
      :value="modelValue" 
      :placeholder="placeholder || '搜索站内链接，回车 Google...'" 
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" 
    />
    <button type="submit" class="search-btn" title="搜索">
      <Search :size="18" />
    </button>
  </form>
</template>

<style scoped>
.search-bar {
  align-items: center;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(20, 24, 33, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  display: flex;
  gap: 12px;
  min-height: 54px;
  margin: 0 auto;
  max-width: 720px;
  overflow: hidden;
  padding: 0 6px 0 20px;
  width: 100%;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-bar:focus-within {
  border-color: rgba(76, 201, 167, 0.4);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35), 0 0 20px rgba(76, 201, 167, 0.15);
  background: rgba(25, 30, 41, 0.75);
}

.search-provider-badge {
  color: var(--accent);
  background: rgba(76, 201, 167, 0.12);
  border: 1px solid rgba(76, 201, 167, 0.25);
  border-radius: 999px;
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 800;
  height: 26px;
  width: 26px;
  display: grid;
  place-items: center;
}

.search-bar input {
  background: transparent;
  border: 0;
  color: #fff;
  flex: 1;
  min-width: 0;
  outline: 0;
  font-size: 15px;
  font-weight: 500;
}

.search-bar input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.search-btn {
  align-self: stretch;
  background: var(--accent);
  border: 0;
  color: #06110e;
  display: grid;
  font-weight: 800;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  margin: auto 0;
  place-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: 0.85;
}

.search-btn:hover {
  transform: scale(1.05);
  opacity: 1;
  background: #34d399; /* brighter green on hover */
}

.search-btn:active {
  transform: scale(0.95);
}
</style>
