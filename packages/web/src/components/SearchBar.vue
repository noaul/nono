<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, ChevronDown, Globe, KeyRound, Search, X } from 'lucide-vue-next';
import { getEngine, getSelectedEngineId, setSelectedEngineId, type SearchEngine, type SearchEngineSettings } from '@/utils/searchEngines';
import { getFaviconUrl } from '@/utils/favicon';
import { useI18n } from '@/composables/useI18n';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  searchEngines: SearchEngineSettings;
  mode?: 'search' | 'password';
  busy?: boolean;
}>(), { mode: 'search', busy: false });
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: []; 'engine-change': [engineId: string] }>();

const { t } = useI18n();

const inputRef = ref<HTMLInputElement | null>(null);
const pickerRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const pickerOpen = ref(false);
const engineId = ref(getSelectedEngineId(props.searchEngines));
const enabledEngines = computed(() => props.searchEngines.items.filter((item) => item.enabled));
const engine = computed(() => getEngine(engineId.value, props.searchEngines));
// Engines whose favicon failed to load fall back to their short mark for the rest of the visit.
const iconErrors = ref<Record<string, boolean>>({});

watch(() => props.searchEngines, (settings) => {
  engineId.value = getSelectedEngineId(settings);
}, { deep: true });

function engineLabel(option: SearchEngine) {
  return option.labelKey ? t(option.labelKey) : option.label;
}

function engineIcon(option: SearchEngine) {
  return iconErrors.value[option.id] ? '' : getFaviconUrl(option.template);
}

function menuOptions() {
  return Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>('.engine-option') || []);
}

async function openPicker() {
  pickerOpen.value = true;
  await nextTick();
  const options = menuOptions();
  (options.find((option) => option.getAttribute('aria-selected') === 'true') || options[0])?.focus();
}

function closePicker(restoreFocus = false) {
  pickerOpen.value = false;
  if (restoreFocus) triggerRef.value?.focus();
}

function togglePicker() {
  if (pickerOpen.value) closePicker();
  else openPicker();
}

function onMenuKeydown(event: KeyboardEvent) {
  const options = menuOptions();
  const current = options.indexOf(document.activeElement as HTMLButtonElement);
  const move: Record<string, number> = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: options.length - 1 };
  if (event.key in move) {
    event.preventDefault();
    options[(move[event.key] + options.length) % options.length]?.focus();
  } else if (event.key === 'Escape') {
    event.stopPropagation();
    closePicker(true);
  } else if (event.key === 'Tab') {
    closePicker();
  }
}

function pickEngine(id: string) {
  engineId.value = id;
  setSelectedEngineId(id);
  pickerOpen.value = false;
  emit('engine-change', id);
  inputRef.value?.focus();
}

function clearQuery() {
  emit('update:modelValue', '');
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
    <div v-if="mode === 'search'" ref="pickerRef" class="engine-picker">
      <button
        ref="triggerRef"
        class="engine-trigger"
        type="button"
        :title="t('search.engineTitle', { label: engineLabel(engine) })"
        :aria-label="t('search.engineTitle', { label: engineLabel(engine) })"
        aria-haspopup="listbox"
        :aria-expanded="pickerOpen"
        data-testid="engine-trigger"
        @click="togglePicker"
        @keydown.down.prevent="openPicker"
        @keydown.up.prevent="openPicker"
      >
        <span class="engine-mark" :class="{ 'has-icon': engineIcon(engine) }" aria-hidden="true">
          <img v-if="engineIcon(engine)" :src="engineIcon(engine)" alt="" decoding="async" @error="iconErrors[engine.id] = true" />
          <Globe v-else-if="engine.short === '·'" :size="15" />
          <template v-else>{{ engine.short }}</template>
        </span>
        <ChevronDown class="engine-caret" :size="14" />
      </button>
      <Transition name="engine-menu">
        <ul v-if="pickerOpen" ref="menuRef" class="engine-menu" role="listbox" :aria-label="t('search.engineMenu')" @keydown="onMenuKeydown">
          <li v-for="option in enabledEngines" :key="option.id" role="presentation">
            <button
              :id="`engine-${option.id}`"
              class="engine-option"
              type="button"
              role="option"
              :aria-selected="option.id === engineId"
              :tabindex="option.id === engineId ? 0 : -1"
              @click="pickEngine(option.id)"
            >
              <span class="engine-mark" :class="{ 'has-icon': engineIcon(option) }" aria-hidden="true">
                <img v-if="engineIcon(option)" :src="engineIcon(option)" alt="" decoding="async" @error="iconErrors[option.id] = true" />
                <Globe v-else-if="option.short === '·'" :size="15" />
                <template v-else>{{ option.short }}</template>
              </span>
              <span class="engine-name">{{ engineLabel(option) }}</span>
              <Check v-if="option.id === engineId" class="engine-check" :size="15" />
            </button>
          </li>
        </ul>
      </Transition>
    </div>
    <span v-if="mode === 'search'" class="search-divider" aria-hidden="true"></span>
    <input
      ref="inputRef"
      :value="modelValue"
      :type="mode === 'password' ? 'password' : 'search'"
      :autocomplete="mode === 'password' ? 'current-password' : 'off'"
      :placeholder="placeholder || (mode === 'password' ? t('search.passwordPlaceholder') : t('search.placeholder'))"
      :aria-label="mode === 'password' ? t('search.passwordAria') : t('search.searchAria')"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="mode === 'search' && modelValue"
      type="button"
      class="search-clear"
      :title="t('search.clear')"
      :aria-label="t('search.clear')"
      data-testid="search-clear"
      @click="clearQuery"
    >
      <X :size="16" />
    </button>
    <kbd v-else-if="mode === 'search'" class="search-kbd" aria-hidden="true">/</kbd>
    <button type="submit" class="search-btn" :title="mode === 'password' ? t('search.unlock') : t('common.search')" :disabled="busy">
      <KeyRound v-if="mode === 'password'" class="search-glyph" :size="18" />
      <Search v-else class="search-glyph" :size="18" />
    </button>
  </form>
</template>

<style scoped>
.search-bar {
  /* Every control inside sits the same inset from the edge and shares one concentric radius, so a
     square-cornered theme gets square controls instead of pills floating in a box. */
  --search-inset: 5px;
  --search-control: clamp(30px, calc(var(--public-search-height, 52px) - 12px), 52px);
  --search-inner-radius: max(3px, calc(var(--public-search-radius, 28px) - var(--search-inset) - 1px));
  --search-ink-rgb: var(--public-search-text-rgb, var(--public-bookmark-text-rgb, 255, 255, 255));
  align-items: center;
  backdrop-filter: blur(var(--public-search-blur, 20px)) saturate(var(--public-glass-saturation, 120%));
  -webkit-backdrop-filter: blur(var(--public-search-blur, 20px)) saturate(var(--public-glass-saturation, 120%));
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), var(--public-search-opacity, 0.34));
  border: var(--public-glass-border-width, 1px) solid
    rgba(var(--public-border-rgb, 255, 255, 255), var(--public-glass-border-opacity, 0.28));
  border-radius: var(--public-search-radius, 28px);
  display: flex;
  gap: 4px;
  min-height: var(--public-search-height, 52px);
  min-width: 0;
  margin: 0 auto;
  max-width: var(--public-search-max-width, 680px);
  padding: var(--search-inset);
  position: relative;
  width: 100%;
  z-index: 40;
  /* Same shadow and rim formula as the NoTab strip, so the two glass bars read as one set. */
  box-shadow:
    0 8px var(--public-glass-shadow-spread, 24px)
      rgba(var(--public-shadow-rgb, 0, 0, 0), calc(var(--public-glass-shadow-strength, 0.32) * 0.44)),
    inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), var(--public-glass-highlight, 0.34));
  transition:
    background-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.search-bar:focus-within {
  animation: search-breathe 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) 1;
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), calc(var(--public-search-opacity, 0.34) + 0.08));
  border-color: rgba(var(--accent-rgb), 0.55);
  box-shadow:
    0 10px var(--public-glass-shadow-spread, 24px)
      rgba(var(--public-shadow-rgb, 0, 0, 0), calc(var(--public-glass-shadow-strength, 0.32) * 0.6)),
    0 0 0 3px rgba(var(--accent-rgb), 0.16),
    inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), var(--public-glass-highlight, 0.34));
}

/* One soft ripple as focus lands, settling into the static ring; it does not keep pulsing while typing. */
@keyframes search-breathe {
  from {
    box-shadow:
      0 10px var(--public-glass-shadow-spread, 24px)
        rgba(var(--public-shadow-rgb, 0, 0, 0), calc(var(--public-glass-shadow-strength, 0.32) * 0.6)),
      0 0 0 0 rgba(var(--accent-rgb), 0.16),
      0 0 0 0 rgba(var(--accent-rgb), 0.3),
      inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), var(--public-glass-highlight, 0.34));
  }

  to {
    box-shadow:
      0 10px var(--public-glass-shadow-spread, 24px)
        rgba(var(--public-shadow-rgb, 0, 0, 0), calc(var(--public-glass-shadow-strength, 0.32) * 0.6)),
      0 0 0 3px rgba(var(--accent-rgb), 0.16),
      0 0 0 10px rgba(var(--accent-rgb), 0),
      inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), var(--public-glass-highlight, 0.34));
  }
}

.engine-picker {
  display: flex;
  flex: 0 0 auto;
  position: relative;
}

.engine-trigger {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--search-inner-radius);
  color: rgba(var(--search-ink-rgb), 0.9);
  cursor: pointer;
  display: inline-flex;
  gap: 3px;
  height: var(--search-control);
  padding: 0 7px 0 calc((var(--search-control) - 26px) / 2);
  transition: background-color 0.2s ease;
}

.engine-trigger:hover,
.engine-trigger[aria-expanded='true'] {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.22);
}

.engine-trigger:focus-visible {
  outline: 2px solid rgba(var(--accent-rgb), 0.75);
  outline-offset: -2px;
}

.engine-caret {
  color: rgba(var(--search-ink-rgb), 0.56);
  transition: transform 0.2s ease;
}

.engine-trigger[aria-expanded='true'] .engine-caret {
  transform: rotate(180deg);
}

/* Engine favicon on a light chip so dark logos stay visible on dark glass; the short text mark
   takes its place for custom engines, or when the icon cannot be fetched. */
.engine-mark {
  align-items: center;
  background: rgba(var(--search-ink-rgb), 0.1);
  border-radius: 999px;
  color: rgb(var(--search-ink-rgb));
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 800;
  height: 26px;
  justify-content: center;
  line-height: 1;
  min-width: 26px;
  padding: 0 6px;
  white-space: nowrap;
}

.engine-mark.has-icon {
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.08);
  padding: 0;
}

.engine-mark img {
  display: block;
  height: 16px;
  object-fit: contain;
  width: 16px;
}

.search-divider {
  align-self: center;
  background: rgba(var(--search-ink-rgb), 0.16);
  flex: 0 0 1px;
  height: 22px;
  margin: 0 4px 0 2px;
}

/*
 * The menu sits inside the search bar, and an element with its own backdrop-filter is the backdrop
 * root for everything inside it: a blur here would only ever see the bar, never the NoTab strip and
 * cards underneath, which then showed straight through the old translucent menu. So it is a fully
 * opaque popover (on a near-black surface even a 2% leak leaves the tabs legible), in the same dark
 * overlay vocabulary as the page's other popovers.
 */
.engine-menu {
  background: rgb(var(--public-overlay-rgb, 8, 12, 18));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--public-card-radius, 8px);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
  color: #f4f4f5;
  display: grid;
  gap: 2px;
  left: 0;
  list-style: none;
  margin: 0;
  min-width: 200px;
  padding: 5px;
  position: absolute;
  top: calc(100% + var(--search-inset) + 8px);
  z-index: 50;
}

.engine-option {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: max(4px, calc(var(--public-card-radius, 8px) - 3px));
  color: inherit;
  cursor: pointer;
  display: grid;
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr) 16px;
  min-height: 38px;
  padding: 0 10px 0 6px;
  text-align: left;
  width: 100%;
}

.engine-option:hover,
.engine-option:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  outline: none;
}

.engine-option[aria-selected='true'] {
  background: rgba(255, 255, 255, 0.06);
}

.engine-option:hover[aria-selected='true'],
.engine-option:focus-visible[aria-selected='true'] {
  background: rgba(255, 255, 255, 0.12);
}

.engine-menu .engine-mark:not(.has-icon) {
  background: rgba(255, 255, 255, 0.12);
  color: #f4f4f5;
}

.engine-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.engine-check {
  color: var(--accent-soft, #a7f3d0);
}

.engine-menu-enter-active,
.engine-menu-leave-active {
  transform-origin: top left;
  transition: opacity 0.16s ease, transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.engine-menu-enter-from,
.engine-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.search-bar input {
  align-self: stretch;
  appearance: none;
  background: transparent;
  border: 0;
  color: var(--public-search-text, var(--public-bookmark-text, #ffffff));
  flex: 1;
  min-width: 0;
  outline: 0;
  font-size: var(--public-search-text-size, 15px);
  font-weight: var(--public-font-weight, 400);
  padding: 0 4px;
}

/* The native clear glyph ignores the theme (a blue cross on dark glass); `.search-clear` replaces it. */
.search-bar input::-webkit-search-cancel-button,
.search-bar input::-webkit-search-decoration {
  appearance: none;
  display: none;
}

/* Sized in CSS rather than through the icon's numeric prop, so it tracks the setting live. */
.search-glyph {
  height: var(--public-search-icon-size, 18px);
  width: var(--public-search-icon-size, 18px);
}

.search-bar input::placeholder {
  color: rgba(var(--public-placeholder-text-rgb, var(--public-bookmark-text-rgb, 255, 255, 255)), 0.62);
}

.search-clear {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: rgba(var(--search-ink-rgb), 0.56);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  height: 30px;
  justify-content: center;
  transition: background-color 0.2s ease, color 0.2s ease;
  width: 30px;
}

.search-clear:hover,
.search-clear:focus-visible {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.22);
  color: rgb(var(--search-ink-rgb));
  outline: none;
}

.search-kbd {
  border: 1px solid rgba(var(--search-ink-rgb), 0.2);
  border-bottom-width: 2px;
  border-radius: 6px;
  color: rgba(var(--search-ink-rgb), 0.5);
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  margin-right: 4px;
  min-width: 22px;
  padding: 4px 6px 3px;
  text-align: center;
}

.search-bar:focus-within .search-kbd {
  display: none;
}

/* Touch devices have no `/` shortcut to advertise, and a phone-width bar needs the room. */
@media (hover: none), (max-width: 640px) {
  .search-kbd {
    display: none;
  }
}

.search-btn {
  background: var(--accent);
  border: 0;
  border-radius: var(--search-inner-radius);
  box-shadow:
    0 1px 2px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  color: var(--public-accent-ink, #ffffff);
  cursor: pointer;
  display: grid;
  flex: 0 0 auto;
  height: var(--search-control);
  place-items: center;
  transform: translateZ(0);
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  width: var(--search-control);
}

.search-btn:hover {
  background: var(--accent-bright, var(--accent));
  box-shadow:
    0 6px 16px rgba(var(--accent-rgb), 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.search-btn:focus-visible {
  outline: 2px solid rgba(var(--accent-rgb), 0.75);
  outline-offset: 2px;
}

.search-btn:active {
  transform: translateY(1px) scale(0.94);
  transition-duration: 0.12s;
}

.search-btn:disabled {
  cursor: wait;
  opacity: 0.58;
}

@media (prefers-reduced-motion: reduce) {
  .search-bar,
  .search-btn,
  .engine-caret,
  .engine-menu-enter-active,
  .engine-menu-leave-active {
    transition: none;
  }

  .search-bar:focus-within {
    animation: none;
  }
}
</style>
