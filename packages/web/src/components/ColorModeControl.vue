<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, Laptop, Moon, Sun } from 'lucide-vue-next';
import { useI18n } from '@/composables/useI18n';
import {
  normalizeColorMode,
  resolveColorMode,
  storedColorMode,
  writeColorMode,
  type ColorModePreference,
  type ResolvedColorMode,
} from '@/utils/colorMode';

withDefaults(defineProps<{ variant?: 'menu' | 'segmented' }>(), { variant: 'menu' });
const emit = defineEmits<{ change: [mode: ResolvedColorMode] }>();

const preference = ref<ColorModePreference>('system');
const resolvedMode = ref<ResolvedColorMode>('light');
const open = ref(false);
const rootElement = ref<HTMLElement | null>(null);
let mediaQuery: MediaQueryList | null = null;

const { t } = useI18n();

const options = computed(() => [
  { value: 'system' as const, label: t('colorMode.system'), icon: Laptop },
  { value: 'light' as const, label: t('colorMode.light'), icon: Sun },
  { value: 'dark' as const, label: t('colorMode.dark'), icon: Moon },
]);

const currentIcon = computed(() => preference.value === 'system' ? Laptop : resolvedMode.value === 'dark' ? Moon : Sun);
const currentLabel = computed(() => options.value.find((option) => option.value === preference.value)?.label || t('colorMode.system'));

function safeStoredPreference() {
  try {
    return storedColorMode(window.localStorage);
  } catch {
    return 'system' as const;
  }
}

function updateDocument() {
  const prefersDark = mediaQuery?.matches ?? false;
  resolvedMode.value = resolveColorMode(preference.value, prefersDark);
  const root = document.documentElement;
  root.dataset.colorMode = resolvedMode.value;
  root.dataset.colorModePreference = preference.value;
  root.style.colorScheme = resolvedMode.value;
  emit('change', resolvedMode.value);
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    'content',
    resolvedMode.value === 'dark' ? '#111318' : '#f6f7f9',
  );
}

function selectMode(value: ColorModePreference) {
  preference.value = normalizeColorMode(value);
  try {
    writeColorMode(preference.value, window.localStorage);
  } catch {
    // The active tab still follows the selected mode when storage is unavailable.
  }
  updateDocument();
  window.dispatchEvent(new CustomEvent('nono-color-mode-change', { detail: preference.value }));
  open.value = false;
}

function onSystemModeChange() {
  if (preference.value === 'system') updateDocument();
}

function onSharedModeChange(event: Event) {
  const detail = event instanceof CustomEvent ? event.detail : safeStoredPreference();
  preference.value = normalizeColorMode(detail);
  updateDocument();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!rootElement.value?.contains(event.target as Node)) open.value = false;
}

onMounted(() => {
  preference.value = safeStoredPreference();
  mediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  mediaQuery?.addEventListener('change', onSystemModeChange);
  window.addEventListener('storage', onSharedModeChange);
  window.addEventListener('nono-color-mode-change', onSharedModeChange);
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  updateDocument();
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', onSystemModeChange);
  window.removeEventListener('storage', onSharedModeChange);
  window.removeEventListener('nono-color-mode-change', onSharedModeChange);
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('pointerdown', onDocumentPointerDown);
});
</script>

<template>
  <div ref="rootElement" class="color-mode-control" :class="`color-mode-${variant}`">
    <div v-if="variant === 'segmented'" class="color-mode-segments" role="group" :aria-label="t('colorMode.label')">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :class="{ active: preference === option.value }"
        :aria-pressed="preference === option.value"
        :title="option.label"
        @click="selectMode(option.value)"
      >
        <component :is="option.icon" :size="16" />
        <span>{{ option.label }}</span>
      </button>
    </div>

    <template v-else>
      <button
        class="color-mode-trigger"
        type="button"
        :title="`${t('colorMode.label')}: ${currentLabel}`"
        :aria-label="t('colorMode.switchLabel')"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="open = !open"
      >
        <component :is="currentIcon" :size="18" />
      </button>
      <Transition name="color-mode-popover">
        <div v-if="open" class="color-mode-popover" role="menu">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            role="menuitemradio"
            :aria-checked="preference === option.value"
            @click="selectMode(option.value)"
          >
            <component :is="option.icon" :size="16" />
            <span>{{ option.label }}</span>
            <Check v-if="preference === option.value" class="mode-check" :size="15" />
          </button>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.color-mode-control {
  color: var(--color-mode-text, currentColor);
  position: relative;
}

.color-mode-trigger {
  align-items: center;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  background: var(--color-mode-surface, rgba(255, 255, 255, 0.34));
  border: 1px solid var(--color-mode-border, rgba(255, 255, 255, 0.3));
  border-radius: 8px;
  box-shadow: var(--color-mode-shadow, 0 12px 34px rgba(0, 0, 0, 0.16));
  color: inherit;
  display: inline-flex;
  height: 42px;
  justify-content: center;
  padding: 0;
  transition: background-color 0.24s ease, border-color 0.24s ease, transform 0.24s ease;
  width: 42px;
}

.color-mode-trigger:hover,
.color-mode-trigger:focus-visible {
  background: var(--color-mode-hover, rgba(255, 255, 255, 0.5));
  transform: translateY(-1px);
}

.color-mode-popover {
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  background: var(--color-mode-popover, rgba(20, 22, 28, 0.92));
  border: 1px solid var(--color-mode-border, rgba(255, 255, 255, 0.16));
  border-radius: 8px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24);
  display: grid;
  gap: 3px;
  min-width: 154px;
  padding: 5px;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 80;
}

.color-mode-popover button {
  align-items: center;
  border-radius: 6px;
  color: var(--color-mode-popover-text, #f4f4f5);
  display: grid;
  font-size: 13px;
  gap: 8px;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  min-height: 36px;
  padding: 0 9px;
  text-align: left;
}

.color-mode-popover button:hover,
.color-mode-popover button:focus-visible {
  background: var(--color-mode-popover-hover, rgba(255, 255, 255, 0.1));
}

.mode-check {
  color: var(--accent, #10b981);
}

.color-mode-segments {
  background: var(--color-mode-segment-bg, rgba(127, 127, 127, 0.1));
  border: 1px solid var(--color-mode-segment-border, rgba(127, 127, 127, 0.18));
  border-radius: 8px;
  display: grid;
  gap: 3px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 3px;
}

.color-mode-segments button {
  align-items: center;
  border-radius: 6px;
  color: inherit;
  display: inline-flex;
  font-size: 13px;
  font-weight: 650;
  gap: 7px;
  justify-content: center;
  min-height: 36px;
  padding: 0 10px;
  transition: background-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
}

.color-mode-segments button.active {
  background: var(--color-mode-segment-active, rgba(255, 255, 255, 0.92));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.color-mode-popover-enter-active,
.color-mode-popover-leave-active {
  transition: opacity 0.18s ease, transform 0.2s ease;
}

.color-mode-popover-enter-from,
.color-mode-popover-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.98);
}

@media (max-width: 480px) {
  .color-mode-segments button span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .color-mode-trigger,
  .color-mode-popover-enter-active,
  .color-mode-popover-leave-active {
    transition: none;
  }
}
</style>
