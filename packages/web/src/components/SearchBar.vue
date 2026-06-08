<script setup lang="ts">
import { Search } from 'lucide-vue-next';

defineProps<{ modelValue: string; placeholder?: string }>();
defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>();
</script>

<template>
  <form class="search-bar" @submit.prevent="$emit('submit')">
    <span class="search-leading-icon" aria-hidden="true">
      <Search :size="17" />
    </span>
    <input 
      :value="modelValue" 
      :placeholder="placeholder || '搜索站内链接，回车继续搜索...'" 
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
  backdrop-filter: blur(14px) saturate(1.12);
  -webkit-backdrop-filter: blur(14px) saturate(1.12);
  background: rgba(10, 14, 18, 0.26);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  display: flex;
  gap: 10px;
  min-height: 52px;
  margin: 0 auto;
  max-width: 680px;
  overflow: hidden;
  padding: 0 6px 0 18px;
  width: 100%;
  box-shadow:
    0 14px 40px rgba(0, 0, 0, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  transition:
    background-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.search-bar:focus-within {
  background: rgba(12, 18, 24, 0.34);
  border-color: rgba(134, 239, 172, 0.38);
  box-shadow:
    0 16px 44px rgba(0, 0, 0, 0.22),
    0 0 0 3px rgba(52, 211, 153, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.search-leading-icon {
  align-items: center;
  color: rgba(226, 232, 240, 0.72);
  display: inline-flex;
  flex: 0 0 auto;
  height: 30px;
  justify-content: center;
  width: 30px;
}

.search-bar input {
  background: transparent;
  border: 0;
  color: #fff;
  flex: 1;
  min-width: 0;
  outline: 0;
  font-size: 15px;
  font-weight: 600;
}

.search-bar input::placeholder {
  color: rgba(226, 232, 240, 0.56);
}

.search-btn {
  align-self: stretch;
  background: rgba(52, 211, 153, 0.92);
  border: 0;
  color: #052016;
  display: grid;
  font-weight: 800;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  margin: auto 0;
  place-items: center;
  cursor: pointer;
  opacity: 0.85;
  transform: translateZ(0);
  transition:
    background-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.search-btn:hover {
  transform: translateY(-1px) scale(1.04);
  opacity: 1;
  background: #6ee7b7;
  box-shadow: 0 10px 24px rgba(16, 185, 129, 0.24);
}

.search-btn:active {
  transform: translateY(1px) scale(0.94);
  transition-duration: 0.12s;
}
</style>
