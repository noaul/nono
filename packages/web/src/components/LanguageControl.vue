<script setup lang="ts">
/**
 * Visitor-facing language switch. Deliberately mirrors ColorModeControl's markup, variants and
 * `--color-mode-*` custom properties so the two controls stay visually locked together
 * wherever they sit side by side.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, Globe, Languages } from 'lucide-vue-next';
import { LOCALE_CHANGE_EVENT, useI18n } from '@/composables/useI18n';
import type { LocalePreference } from '@/utils/locale';

withDefaults(defineProps<{ variant?: 'menu' | 'segmented' }>(), { variant: 'menu' });

const { t, locale, preference, setLocalePreference } = useI18n();

const open = ref(false);
const rootElement = ref<HTMLElement | null>(null);

const options = computed(() => [
  { value: 'site' as const, label: t('language.site'), icon: Globe },
  { value: 'zh' as const, label: t('language.zh'), icon: Languages },
  { value: 'en' as const, label: t('language.en'), icon: Languages },
]);

const currentLabel = computed(() => {
  if (preference.value === 'site') return t('language.site');
  return preference.value === 'zh' ? t('language.zh') : t('language.en');
});

function selectLocale(value: LocalePreference) {
  setLocalePreference(value);
  open.value = false;
}

function onSharedLocaleChange() {
  // The composable already updated the shared state; this only closes an open menu elsewhere.
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!rootElement.value?.contains(event.target as Node)) open.value = false;
}

onMounted(() => {
  window.addEventListener(LOCALE_CHANGE_EVENT, onSharedLocaleChange);
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onDocumentPointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener(LOCALE_CHANGE_EVENT, onSharedLocaleChange);
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('pointerdown', onDocumentPointerDown);
});
</script>

<template>
  <div ref="rootElement" class="language-control" :class="`language-${variant}`" data-testid="language-control">
    <div v-if="variant === 'segmented'" class="language-segments" role="group" :aria-label="t('language.label')">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :class="{ active: preference === option.value }"
        :aria-pressed="preference === option.value"
        :title="option.label"
        :data-testid="`language-option-${option.value}`"
        @click="selectLocale(option.value)"
      >
        <component :is="option.icon" :size="16" />
        <span>{{ option.label }}</span>
      </button>
    </div>

    <template v-else>
      <button
        class="language-trigger"
        type="button"
        :title="`${t('language.label')}: ${currentLabel}`"
        :aria-label="t('language.switchLabel')"
        aria-haspopup="menu"
        :aria-expanded="open"
        data-testid="language-trigger"
        @click="open = !open"
      >
        <Languages :size="18" />
        <span class="language-tag">{{ locale === 'zh' ? '中' : 'EN' }}</span>
      </button>
      <Transition name="language-popover">
        <div v-if="open" class="language-popover" role="menu">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            role="menuitemradio"
            :aria-checked="preference === option.value"
            :data-testid="`language-option-${option.value}`"
            @click="selectLocale(option.value)"
          >
            <component :is="option.icon" :size="16" />
            <span>{{ option.label }}</span>
            <Check v-if="preference === option.value" class="language-check" :size="15" />
          </button>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.language-control {
  color: var(--color-mode-text, currentColor);
  position: relative;
}

.language-trigger {
  align-items: center;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  background: var(--color-mode-surface, rgba(255, 255, 255, 0.34));
  border: 1px solid var(--color-mode-border, rgba(255, 255, 255, 0.3));
  border-radius: 8px;
  box-shadow: var(--color-mode-shadow, 0 12px 34px rgba(0, 0, 0, 0.16));
  color: inherit;
  display: inline-flex;
  gap: 5px;
  height: 42px;
  justify-content: center;
  padding: 0 11px;
  transition: background-color 0.24s ease, border-color 0.24s ease, transform 0.24s ease;
}

.language-trigger:hover,
.language-trigger:focus-visible {
  background: var(--color-mode-hover, rgba(255, 255, 255, 0.5));
  transform: translateY(-1px);
}

/* The contract sets letter-spacing to 0; this control renders inside the unified admin shell. */
.language-tag {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
}

.language-popover {
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  background: var(--color-mode-popover, rgba(20, 22, 28, 0.92));
  border: 1px solid var(--color-mode-border, rgba(255, 255, 255, 0.16));
  border-radius: 8px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24);
  display: grid;
  gap: 3px;
  min-width: 158px;
  padding: 5px;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 80;
}

.language-popover button {
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

.language-popover button:hover,
.language-popover button:focus-visible {
  background: var(--color-mode-popover-hover, rgba(255, 255, 255, 0.1));
}

.language-check {
  color: var(--accent, #10b981);
}

.language-segments {
  background: var(--color-mode-segment-bg, rgba(127, 127, 127, 0.1));
  border: 1px solid var(--color-mode-segment-border, rgba(127, 127, 127, 0.18));
  border-radius: 8px;
  display: grid;
  gap: 3px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 3px;
}

.language-segments button {
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

.language-segments button.active {
  background: var(--color-mode-segment-active, rgba(255, 255, 255, 0.92));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.language-popover-enter-active,
.language-popover-leave-active {
  transition: opacity 0.18s ease, transform 0.2s ease;
}

.language-popover-enter-from,
.language-popover-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.98);
}

@media (max-width: 480px) {
  .language-segments button span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .language-trigger,
  .language-popover-enter-active,
  .language-popover-leave-active {
    transition: none;
  }
}
</style>
