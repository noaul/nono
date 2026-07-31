<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { ChevronDown, Search, X } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import { useModalBehavior } from '@/composables/useModalBehavior';
import { folderIconOptions, getFolderIconOption, type FolderIconOption } from '@/utils/folder-icons';
import { useI18n } from '@/composables/useI18n';

type IconTab = 'recommended' | 'recent' | 'all';

const props = withDefaults(defineProps<{
  modelValue: string;
  testId?: string;
}>(), {
  testId: 'folder-icon-picker',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { t } = useI18n();

const recentStorageKey = 'nono-recent-folder-icons';
const tabValues: IconTab[] = ['recommended', 'recent', 'all'];
const open = ref(false);
const query = ref('');
const activeTab = ref<IconTab>('recommended');
const recentValues = ref<string[]>([]);
const searchInput = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);

const currentOption = computed(() => getFolderIconOption(props.modelValue));
const currentLabel = computed(() => (currentOption.value ? t(currentOption.value.labelKey) : t(props.modelValue ? 'folderIcons.current' : 'folderIcons.pickerLabel')));
const filteredOptions = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase();
  let options: FolderIconOption[];
  if (normalizedQuery) {
    options = folderIconOptions;
  } else if (activeTab.value === 'recent') {
    const byValue = new Map(folderIconOptions.map((option) => [option.value, option]));
    options = recentValues.value.map((value) => byValue.get(value)).filter((option): option is FolderIconOption => Boolean(option));
  } else if (activeTab.value === 'recommended') {
    options = folderIconOptions.filter((option) => option.recommended);
  } else {
    options = folderIconOptions;
  }

  if (!normalizedQuery) return options;
  return options.filter((option) => [t(option.labelKey), option.value, ...option.keywords].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
});

function readRecent() {
  try {
    const stored = JSON.parse(localStorage.getItem(recentStorageKey) || '[]');
    recentValues.value = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string').slice(0, 12) : [];
  } catch {
    recentValues.value = [];
  }
}

function writeRecent(value: string) {
  const next = [value, ...recentValues.value.filter((item) => item !== value)].slice(0, 12);
  recentValues.value = next;
  try {
    localStorage.setItem(recentStorageKey, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in hardened browsers; selection still works.
  }
}

async function openPicker() {
  readRecent();
  query.value = '';
  activeTab.value = 'recommended';
  open.value = true;
  await nextTick();
  searchInput.value?.focus();
}

function closePicker() {
  open.value = false;
}

function selectTab(tab: IconTab) {
  if (!tabValues.includes(tab)) return;
  activeTab.value = tab;
  query.value = '';
}

function chooseIcon(option: FolderIconOption) {
  emit('update:modelValue', option.value);
  writeRecent(option.value);
  closePicker();
}

function clearIcon() {
  emit('update:modelValue', '');
  closePicker();
}

onMounted(() => {
  readRecent();
});

useModalBehavior({
  open,
  container: dialog,
  close: closePicker,
  initialFocus: () => searchInput.value,
});
</script>

<template>
  <button class="folder-icon-trigger" :data-testid="testId" type="button" aria-haspopup="dialog" :aria-expanded="open" @click="openPicker">
    <span class="folder-icon-trigger-glyph"><FolderGlyph :icon="modelValue" :size="19" /></span>
    <span class="folder-icon-trigger-label">{{ currentLabel }}</span>
    <ChevronDown :size="16" />
  </button>

  <Teleport to="body">
    <div v-if="open" class="folder-icon-backdrop" role="presentation" @click.self="closePicker">
      <section ref="dialog" class="folder-icon-dialog" data-testid="folder-icon-dialog" role="dialog" aria-modal="true" :aria-label="t('folderIcons.pickerLabel')" tabindex="-1">
        <header class="folder-icon-dialog-head">
          <h2>{{ t('folderIcons.pickerLabel') }}</h2>
          <button class="icon-button secondary" type="button" :aria-label="t('folderIcons.closeLabel')" @click="closePicker"><X :size="17" /></button>
        </header>

        <label class="folder-icon-search-field">
          <Search :size="19" />
          <input ref="searchInput" v-model="query" data-testid="folder-icon-search" type="search" :placeholder="t('ui.iconSearchPlaceholder')" />
        </label>

        <div class="folder-icon-tabs" role="tablist" :aria-label="t('folderIcons.scopeLabel')">
          <button data-testid="folder-icon-tab-recommended" type="button" role="tab" :aria-selected="activeTab === 'recommended'" :class="{ active: activeTab === 'recommended' }" @click="selectTab('recommended')">{{ t('ui.tabRecommended') }}</button>
          <button data-testid="folder-icon-tab-recent" type="button" role="tab" :aria-selected="activeTab === 'recent'" :class="{ active: activeTab === 'recent' }" @click="selectTab('recent')">{{ t('ui.tabRecent') }}</button>
          <button data-testid="folder-icon-tab-all" type="button" role="tab" :aria-selected="activeTab === 'all'" :class="{ active: activeTab === 'all' }" @click="selectTab('all')">{{ t('ui.tabAll') }}</button>
        </div>

        <div class="folder-icon-dialog-body">
          <p class="folder-icon-section-title">{{ query ? t('ui.searchResults') : activeTab === 'recommended' ? t('ui.recommendedFolders') : activeTab === 'recent' ? t('ui.recentlyUsed') : t('ui.allIcons') }}</p>
          <div v-if="filteredOptions.length" class="folder-icon-grid">
            <button
              v-for="option in filteredOptions"
              :key="option.value"
              class="folder-icon-option"
              :class="{ selected: modelValue === option.value }"
              :data-testid="`folder-icon-option-${option.value}`"
              type="button"
              :aria-pressed="modelValue === option.value"
              @click="chooseIcon(option)"
            >
              <component :is="option.component" :size="29" :stroke-width="1.9" />
              <span>{{ t(option.labelKey) }}</span>
            </button>
          </div>
          <div v-else class="folder-icon-empty">{{ t('ui.noIconMatch') }}</div>
        </div>

        <footer class="folder-icon-dialog-footer">
          <button class="button secondary" type="button" @click="clearIcon">{{ t('ui.clearIcon') }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* Positioning, sizing and the responsive grid are unchanged. Every colour now comes from the
   admin tokens, so the whole dialog follows the colour mode without a second hard-coded block,
   and the decorative glass blur is gone. */
.folder-icon-trigger {
  align-items: center;
  background: var(--admin-control-bg);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-control-radius);
  color: var(--admin-text);
  display: grid;
  gap: 9px;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  min-height: var(--admin-control-height);
  padding: 4px 11px 4px 5px;
  text-align: left;
  transition: border-color 0.24s ease, background-color 0.24s ease, box-shadow 0.24s ease;
  width: 100%;
}

.folder-icon-trigger:hover,
.folder-icon-trigger:focus-visible {
  background: var(--admin-surface-sunken);
  border-color: var(--admin-accent);
  box-shadow: var(--ui-focus-ring);
}

.folder-icon-trigger-glyph {
  align-items: center;
  background: var(--admin-surface-sunken);
  border: 1px solid var(--admin-border);
  border-radius: var(--ui-radius-sm);
  display: inline-flex;
  height: 32px;
  justify-content: center;
  width: 32px;
}

.folder-icon-trigger-label {
  font-size: 13px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-icon-backdrop {
  align-items: center;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  z-index: 1200;
}

.folder-icon-dialog {
  background: var(--admin-surface-elevated);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-surface-radius);
  box-shadow: var(--ui-shadow-md);
  color: var(--admin-text);
  display: grid;
  max-height: min(780px, calc(100vh - 48px));
  max-width: 1040px;
  overflow: hidden;
  overscroll-behavior: contain;
  padding: 20px;
  width: min(1040px, 100%);
}

.folder-icon-dialog-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.folder-icon-dialog-head h2 {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0;
  margin: 0;
}

.folder-icon-search-field {
  align-items: center;
  background: var(--admin-control-bg);
  border: 1px solid var(--admin-border);
  border-radius: var(--ui-radius-sm);
  color: var(--admin-text-muted);
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  margin-top: 18px;
  padding: 0 13px;
}

.folder-icon-search-field:focus-within {
  border-color: var(--admin-accent);
  box-shadow: var(--ui-focus-ring);
}

.folder-icon-search-field input {
  background: transparent;
  border: 0;
  color: var(--admin-text);
  font: inherit;
  min-height: var(--admin-control-height);
  outline: none;
  width: 100%;
}

.folder-icon-tabs {
  border-bottom: 1px solid var(--admin-border);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 14px;
}

.folder-icon-tabs button {
  background: transparent;
  border-bottom: 2px solid transparent;
  color: var(--admin-text-muted);
  font-weight: 750;
  min-height: 46px;
}

.folder-icon-tabs button:hover,
.folder-icon-tabs button.active {
  background: var(--ui-accent-soft);
  border-bottom-color: var(--admin-accent);
  color: var(--admin-accent);
}

.folder-icon-dialog-body {
  min-height: 220px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 2px 6px;
}

.folder-icon-section-title {
  color: var(--admin-text-muted);
  font-size: 13px;
  font-weight: 800;
  margin: 0 0 12px;
}

.folder-icon-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(8, minmax(0, 1fr));
}

.folder-icon-option {
  align-items: center;
  aspect-ratio: 1;
  background: var(--admin-surface);
  border: 1px solid var(--admin-border);
  border-radius: var(--ui-radius-sm);
  color: var(--admin-text);
  display: flex;
  flex-direction: column;
  gap: 9px;
  justify-content: center;
  min-height: 96px;
  padding: 10px 6px;
  transition: background-color 0.22s ease, border-color 0.22s ease, transform 0.22s ease;
}

.folder-icon-option span {
  font-size: 12px;
  font-weight: 650;
}

.folder-icon-option:hover,
.folder-icon-option:focus-visible,
.folder-icon-option.selected {
  background: var(--ui-accent-soft);
  border-color: color-mix(in srgb, var(--admin-accent) 52%, transparent);
  color: var(--admin-accent);
  outline: none;
  transform: translateY(-1px);
}

.folder-icon-empty {
  align-items: center;
  color: var(--admin-text-muted);
  display: flex;
  justify-content: center;
  min-height: 180px;
}

.folder-icon-dialog-footer {
  border-top: 1px solid var(--admin-border);
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  padding-top: 14px;
}

@media (max-width: 880px) {
  .folder-icon-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .folder-icon-backdrop {
    align-items: flex-end;
    padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
  }

  .folder-icon-dialog {
    max-height: calc(100dvh - 20px);
    padding: 16px;
  }

  .folder-icon-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .folder-icon-option {
    min-height: 88px;
  }
}
</style>
