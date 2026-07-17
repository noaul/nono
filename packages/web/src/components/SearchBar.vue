<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, ChevronDown, Search } from 'lucide-vue-next';
import { getEngine, getSelectedEngineId, setSelectedEngineId, type SearchEngineSettings } from '@/utils/searchEngines';

const props = defineProps<{ modelValue: string; placeholder?: string; searchEngines: SearchEngineSettings }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: []; 'engine-change': [engineId: string] }>();

const inputRef = ref<HTMLInputElement | null>(null);
const pickerRef = ref<HTMLElement | null>(null);
const pickerOpen = ref(false);
const engineId = ref(getSelectedEngineId(props.searchEngines));
const enabledEngines = computed(() => props.searchEngines.items.filter((item) => item.enabled));
const engine = computed(() => getEngine(engineId.value, props.searchEngines));

watch(() => props.searchEngines, (settings) => {
  engineId.value = getSelectedEngineId(settings);
}, { deep: true });

function pickEngine(id: string) {
  engineId.value = id;
  setSelectedEngineId(id);
  pickerOpen.value = false;
  emit('engine-change', id);
  inputRef.value?.focus();
}

function onDocumentClick(event: MouseEvent) {
  if (!pickerOpen.value) return;
  if (pickerRef.value && event.target instanceof Node && !pickerRef.value.contains(event.target)) {
    pickerOpen.value = false;
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') pickerOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});

defineExpose({
  focus: () => inputRef.value?.focus(),
});
</script>

<template>
  <form class="search-bar" @submit.prevent="$emit('submit')">
    <div ref="pickerRef" class="engine-picker">
      <button
        class="engine-trigger"
        type="button"
        :title="`搜索引擎：${engine.label}`"
        aria-haspopup="listbox"
        :aria-expanded="pickerOpen"
        data-testid="engine-trigger"
        @click="pickerOpen = !pickerOpen"
      >
        <span class="engine-badge">{{ engine.short }}</span>
        <ChevronDown class="engine-caret" :size="13" />
      </button>
      <ul v-if="pickerOpen" class="engine-menu" role="listbox" :aria-activedescendant="`engine-${engineId}`">
        <li v-for="option in enabledEngines" :key="option.id">
          <button
            :id="`engine-${option.id}`"
            class="engine-option"
            type="button"
            role="option"
            :aria-selected="option.id === engineId"
            @click="pickEngine(option.id)"
          >
            <span class="engine-badge">{{ option.short }}</span>
            <span class="engine-name">{{ option.label }}</span>
            <Check v-if="option.id === engineId" :size="14" />
          </button>
        </li>
      </ul>
    </div>
    <input
      ref="inputRef"
      :value="modelValue"
      :placeholder="placeholder || '搜索站内链接，回车继续搜索...'"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <kbd class="search-kbd" aria-hidden="true">/</kbd>
    <button type="submit" class="search-btn" title="搜索">
      <Search :size="18" />
    </button>
  </form>
</template>

<style scoped>
.search-bar {
  align-items: center;
  backdrop-filter: blur(var(--public-search-blur, 20px)) saturate(1.22);
  -webkit-backdrop-filter: blur(var(--public-search-blur, 20px)) saturate(1.22);
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), var(--public-search-opacity, 0.34));
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: var(--public-search-radius, 28px);
  display: flex;
  gap: 10px;
  min-height: 52px;
  min-width: 0;
  margin: 0 auto;
  max-width: 680px;
  padding: 0 6px 0 10px;
  position: relative;
  width: 100%;
  z-index: 40;
  box-shadow:
    0 14px 40px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset 0 -1px 0 rgba(255, 255, 255, 0.08);
  transition:
    background-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.search-bar:focus-within {
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), calc(var(--public-search-opacity, 0.34) + 0.08));
  border-color: rgba(var(--accent-soft-rgb), 0.46);
  box-shadow:
    0 16px 44px rgba(0, 0, 0, 0.16),
    0 0 0 3px rgba(var(--accent-bright-rgb), 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.48);
}

.engine-picker {
  flex: 0 0 auto;
  position: relative;
}

.engine-trigger {
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.88);
  cursor: pointer;
  display: inline-flex;
  gap: 4px;
  min-height: 34px;
  padding: 0 8px 0 5px;
  transition:
    background-color 0.24s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.engine-trigger:hover,
.engine-trigger:focus-visible {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.24);
  outline: none;
}

.engine-badge {
  align-items: center;
  background: rgba(var(--accent-rgb), 0.16);
  border-radius: 999px;
  color: var(--accent-soft);
  display: inline-flex;
  font-size: 12px;
  font-weight: 800;
  height: 24px;
  justify-content: center;
  width: 24px;
}

.engine-caret {
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.62);
}

.engine-menu {
  backdrop-filter: blur(var(--public-card-blur, 18px)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--public-card-blur, 18px)) saturate(1.2);
  background: rgba(var(--public-card-color-rgb, 247, 248, 251), var(--public-card-opacity, 0.26));
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: var(--public-card-radius, 8px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.34),
    inset 0 -1px 0 rgba(255, 255, 255, 0.08),
    0 14px 34px rgba(0, 0, 0, 0.12);
  display: grid;
  gap: 2px;
  left: 0;
  list-style: none;
  margin: 0;
  min-width: 190px;
  padding: 6px;
  position: absolute;
  top: calc(100% + 10px);
  z-index: 50;
}

.engine-option {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.94);
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 13.5px;
  font-weight: 650;
  gap: 10px;
  padding: 7px 9px;
  text-align: left;
  width: 100%;
}

.engine-option:hover,
.engine-option:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  outline: none;
}

.engine-option[aria-selected='true'] {
  color: var(--accent-soft);
}

.engine-name {
  flex: 1;
}

.search-bar input {
  background: transparent;
  border: 0;
  color: var(--public-bookmark-text, #ffffff);
  flex: 1;
  min-width: 0;
  outline: 0;
  font-size: 15px;
  font-weight: 600;
}

.search-bar input::placeholder {
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.62);
}

.search-kbd {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.58);
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  padding: 4px 7px;
}

.search-bar:focus-within .search-kbd {
  display: none;
}

.search-btn {
  align-self: stretch;
  background: rgba(var(--accent-bright-rgb), 0.92);
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
}

.search-btn:hover {
  transform: translateY(-1px) scale(1.04);
  opacity: 1;
  background: var(--accent-hover);
  box-shadow: 0 10px 24px rgba(var(--accent-rgb), 0.24);
}

.search-btn:active {
  transform: translateY(1px) scale(0.94);
  transition-duration: 0.12s;
}

@media (prefers-reduced-motion: reduce) {
  .search-bar,
  .search-btn {
    transition: none;
  }
}
</style>
