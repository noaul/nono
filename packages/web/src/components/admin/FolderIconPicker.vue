<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { ChevronDown, Search, X } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import { useModalBehavior } from '@/composables/useModalBehavior';
import { folderIconOptions, getFolderIconOption, type FolderIconOption } from '@/utils/folder-icons';

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

const recentStorageKey = 'nono-recent-folder-icons';
const tabValues: IconTab[] = ['recommended', 'recent', 'all'];
const open = ref(false);
const query = ref('');
const activeTab = ref<IconTab>('recommended');
const recentValues = ref<string[]>([]);
const searchInput = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);

const currentOption = computed(() => getFolderIconOption(props.modelValue));
const currentLabel = computed(() => currentOption.value?.label || (props.modelValue ? '当前图标' : '选择图标'));
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
  return options.filter((option) => [option.label, option.value, ...option.keywords].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
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
      <section ref="dialog" class="folder-icon-dialog" data-testid="folder-icon-dialog" role="dialog" aria-modal="true" aria-label="选择图标" tabindex="-1">
        <header class="folder-icon-dialog-head">
          <h2>选择图标</h2>
          <button class="icon-button secondary" type="button" aria-label="关闭图标选择" @click="closePicker"><X :size="17" /></button>
        </header>

        <label class="folder-icon-search-field">
          <Search :size="19" />
          <input ref="searchInput" v-model="query" data-testid="folder-icon-search" type="search" placeholder="搜索图标，如：文件夹、开发、AI、购物…" />
        </label>

        <div class="folder-icon-tabs" role="tablist" aria-label="图标范围">
          <button data-testid="folder-icon-tab-recommended" type="button" role="tab" :aria-selected="activeTab === 'recommended'" :class="{ active: activeTab === 'recommended' }" @click="selectTab('recommended')">推荐</button>
          <button data-testid="folder-icon-tab-recent" type="button" role="tab" :aria-selected="activeTab === 'recent'" :class="{ active: activeTab === 'recent' }" @click="selectTab('recent')">最近</button>
          <button data-testid="folder-icon-tab-all" type="button" role="tab" :aria-selected="activeTab === 'all'" :class="{ active: activeTab === 'all' }" @click="selectTab('all')">全部</button>
        </div>

        <div class="folder-icon-dialog-body">
          <p class="folder-icon-section-title">{{ query ? '搜索结果' : activeTab === 'recommended' ? '文件夹推荐' : activeTab === 'recent' ? '最近使用' : '全部图标' }}</p>
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
              <span>{{ option.label }}</span>
            </button>
          </div>
          <div v-else class="folder-icon-empty">没有匹配的图标</div>
        </div>

        <footer class="folder-icon-dialog-footer">
          <button class="button secondary" type="button" @click="clearIcon">清除图标</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.folder-icon-trigger {
  align-items: center;
  background: rgba(255, 255, 255, 0.56);
  border: 1px solid var(--admin-control-border, rgba(76, 101, 94, 0.28));
  border-radius: var(--admin-control-radius, 8px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
  color: var(--text);
  display: grid;
  gap: 9px;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  min-height: var(--admin-control-height, 42px);
  padding: 4px 11px 4px 5px;
  text-align: left;
  transition: border-color 0.24s ease, background-color 0.24s ease, box-shadow 0.24s ease;
  width: 100%;
}

.folder-icon-trigger:hover,
.folder-icon-trigger:focus-visible {
  background: rgba(255, 255, 255, 0.72);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.12);
}

.folder-icon-trigger-glyph {
  align-items: center;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 7px;
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
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  background: rgba(15, 23, 42, 0.3);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  z-index: 1200;
}

.folder-icon-dialog {
  -webkit-backdrop-filter: blur(var(--admin-surface-blur, 20px)) saturate(1.12);
  backdrop-filter: blur(var(--admin-surface-blur, 20px)) saturate(1.12);
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: var(--admin-surface-radius, 8px);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.82);
  color: #18201d;
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
  font-size: 22px;
  letter-spacing: 0;
  margin: 0;
}

.folder-icon-search-field {
  align-items: center;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(76, 101, 94, 0.28);
  border-radius: 8px;
  color: #64748b;
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  margin-top: 18px;
  padding: 0 13px;
}

.folder-icon-search-field:focus-within {
  border-color: var(--nono-accent, #0f766e);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.folder-icon-search-field input {
  background: transparent;
  border: 0;
  color: #18201d;
  min-height: 46px;
  padding: 0;
  width: 100%;
}

.folder-icon-tabs {
  border-bottom: 1px solid rgba(100, 116, 139, 0.18);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 14px;
}

.folder-icon-tabs button {
  background: transparent;
  border-bottom: 2px solid transparent;
  color: #64748b;
  font-weight: 750;
  min-height: 46px;
}

.folder-icon-tabs button:hover,
.folder-icon-tabs button.active {
  background: rgba(15, 118, 110, 0.05);
  border-bottom-color: var(--nono-accent, #0f766e);
  color: var(--nono-accent, #0f766e);
}

.folder-icon-dialog-body {
  min-height: 220px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 2px 6px;
}

.folder-icon-section-title {
  color: #64748b;
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
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  color: #334155;
  display: flex;
  flex-direction: column;
  gap: 9px;
  justify-content: center;
  min-height: 96px;
  padding: 10px 6px;
  transition: background-color 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
}

.folder-icon-option span {
  font-size: 12px;
  font-weight: 650;
}

.folder-icon-option:hover,
.folder-icon-option:focus-visible,
.folder-icon-option.selected {
  background: rgba(236, 253, 245, 0.88);
  border-color: rgba(15, 118, 110, 0.52);
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.1);
  color: #0f766e;
  outline: none;
  transform: translateY(-1px);
}

.folder-icon-empty {
  align-items: center;
  color: #64748b;
  display: flex;
  justify-content: center;
  min-height: 180px;
}

.folder-icon-dialog-footer {
  border-top: 1px solid rgba(100, 116, 139, 0.16);
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  padding-top: 14px;
}

.folder-icon-dialog .icon-button.secondary,
.folder-icon-dialog .button.secondary {
  background: rgba(255, 255, 255, 0.66);
  border-color: rgba(76, 101, 94, 0.24);
  color: #334155;
}

.folder-icon-dialog .icon-button.secondary:hover,
.folder-icon-dialog .button.secondary:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(15, 118, 110, 0.42);
  color: #0f766e;
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

:global(:root[data-color-mode='dark']) .folder-icon-dialog {
  background: rgba(29, 32, 39, 0.96);
  border-color: #363a44;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.38);
  color: #f3f4f6;
}

:global(:root[data-color-mode='dark']) .folder-icon-search-field,
:global(:root[data-color-mode='dark']) .folder-icon-option,
:global(:root[data-color-mode='dark']) .folder-icon-dialog .icon-button.secondary,
:global(:root[data-color-mode='dark']) .folder-icon-dialog .button.secondary {
  background: #292c34;
  border-color: #414650;
  color: #e5e7eb;
}

:global(:root[data-color-mode='dark']) .folder-icon-search-field input {
  color: #f3f4f6;
}

:global(:root[data-color-mode='dark']) .folder-icon-tabs,
:global(:root[data-color-mode='dark']) .folder-icon-dialog-footer {
  border-color: #363a44;
}

:global(:root[data-color-mode='dark']) .folder-icon-tabs button,
:global(:root[data-color-mode='dark']) .folder-icon-section-title,
:global(:root[data-color-mode='dark']) .folder-icon-empty {
  color: #aeb4bf;
}

:global(:root[data-color-mode='dark']) .folder-icon-option:hover,
:global(:root[data-color-mode='dark']) .folder-icon-option:focus-visible,
:global(:root[data-color-mode='dark']) .folder-icon-option.selected {
  background: rgba(45, 212, 191, 0.12);
  border-color: rgba(45, 212, 191, 0.42);
  color: #5eead4;
}
</style>
