<script setup lang="ts">
import { computed } from 'vue';
import { Gauge, LayoutGrid, RotateCcw, Search, SlidersHorizontal, Type } from 'lucide-vue-next';
import { appearanceDefaults, toAppearanceCssVars, type AppearanceSettings } from '@/utils/appearance';

const props = defineProps<{ appearance: AppearanceSettings; previewBg: string }>();

const previewStyle = computed(() => ({
  ...toAppearanceCssVars(props.appearance),
  '--preview-bg': props.previewBg || '#090a0f',
}));

function applyPreset(preset: 'performance' | 'balanced' | 'clear') {
  const values: Record<typeof preset, AppearanceSettings> = {
    performance: {
      ...appearanceDefaults,
      cardRadius: 6, cardOpacity: 72, cardBlur: 0,
      searchRadius: 24, searchOpacity: 62, searchBlur: 0,
      modalRadius: 8, modalOpacity: 90, modalBlur: 0,
      tabRadius: 20, tabOpacity: 72, tabBlur: 0,
      adminRadius: 6, adminOpacity: 88, adminBlur: 4,
    },
    balanced: { ...appearanceDefaults },
    clear: {
      ...appearanceDefaults,
      cardRadius: 12, cardOpacity: 22, cardBlur: 22,
      searchRadius: 30, searchOpacity: 30, searchBlur: 26,
      modalRadius: 16, modalOpacity: 88, modalBlur: 30,
      tabRadius: 24, tabOpacity: 64, tabBlur: 20,
      adminRadius: 12, adminOpacity: 84, adminBlur: 16,
    },
  };
  Object.assign(props.appearance, values[preset]);
}

function resetAppearance() {
  Object.assign(props.appearance, appearanceDefaults);
}
</script>

<template>
  <section class="admin-card appearance-editor">
    <header class="admin-card-head">
      <div>
        <h2><SlidersHorizontal :size="18" /> 玻璃质感</h2>
        <p>所有调整都会即时显示在右侧预览</p>
      </div>
      <div class="preset-group" aria-label="外观预设">
        <button type="button" @click="applyPreset('performance')"><Gauge :size="15" /> 性能</button>
        <button type="button" @click="applyPreset('balanced')">均衡</button>
        <button type="button" @click="applyPreset('clear')">通透</button>
        <button class="reset-appearance" type="button" title="恢复默认外观" aria-label="恢复默认外观" @click="resetAppearance">
          <RotateCcw :size="15" />
        </button>
      </div>
    </header>

    <div class="appearance-layout">
      <div class="appearance-controls">
        <fieldset>
          <legend><LayoutGrid :size="16" /> 文件夹卡片</legend>
          <label class="color-field">
            <span>玻璃底色</span>
            <span class="color-control">
              <input v-model="appearance.cardColor" data-testid="card-color" type="color" />
              <code>{{ appearance.cardColor }}</code>
            </span>
          </label>
          <label class="range-field">
            <span>圆角 <output>{{ appearance.cardRadius }}px</output></span>
            <input v-model.number="appearance.cardRadius" data-testid="card-radius" type="range" min="0" max="24" step="1" />
          </label>
          <label class="range-field">
            <span>透明度 <output>{{ appearance.cardOpacity }}%</output></span>
            <input v-model.number="appearance.cardOpacity" data-testid="card-opacity" type="range" min="12" max="90" step="1" />
          </label>
          <label class="range-field">
            <span>高斯模糊 <output>{{ appearance.cardBlur }}px</output></span>
            <input v-model.number="appearance.cardBlur" data-testid="card-blur" type="range" min="0" max="32" step="1" />
          </label>
        </fieldset>
        <fieldset>
          <legend><Search :size="16" /> 搜索框</legend>
          <label class="color-field">
            <span>玻璃底色</span>
            <span class="color-control">
              <input v-model="appearance.searchColor" data-testid="search-color" type="color" />
              <code>{{ appearance.searchColor }}</code>
            </span>
          </label>
          <label class="range-field">
            <span>圆角 <output>{{ appearance.searchRadius }}px</output></span>
            <input v-model.number="appearance.searchRadius" data-testid="search-radius" type="range" min="8" max="40" step="1" />
          </label>
          <label class="range-field">
            <span>透明度 <output>{{ appearance.searchOpacity }}%</output></span>
            <input v-model.number="appearance.searchOpacity" data-testid="search-opacity" type="range" min="12" max="90" step="1" />
          </label>
          <label class="range-field">
            <span>高斯模糊 <output>{{ appearance.searchBlur }}px</output></span>
            <input v-model.number="appearance.searchBlur" data-testid="search-blur" type="range" min="0" max="32" step="1" />
          </label>
        </fieldset>
        <fieldset>
          <legend><Type :size="16" /> 公开页文字</legend>
          <label class="color-field">
            <span>书签与搜索文字</span>
            <span class="color-control">
              <input v-model="appearance.bookmarkTextColor" data-testid="bookmark-text-color" type="color" />
              <code>{{ appearance.bookmarkTextColor }}</code>
            </span>
          </label>
          <label class="color-field">
            <span>大类与文件夹标题</span>
            <span class="color-control">
              <input v-model="appearance.categoryTextColor" data-testid="category-text-color" type="color" />
              <code>{{ appearance.categoryTextColor }}</code>
            </span>
          </label>
        </fieldset>
        <fieldset>
          <legend>弹窗</legend>
          <label class="range-field">
            <span>圆角 <output>{{ appearance.modalRadius }}px</output></span>
            <input v-model.number="appearance.modalRadius" data-testid="modal-radius" type="range" min="0" max="32" step="1" />
          </label>
          <label class="range-field">
            <span>透明度 <output>{{ appearance.modalOpacity }}%</output></span>
            <input v-model.number="appearance.modalOpacity" data-testid="modal-opacity" type="range" min="20" max="96" step="1" />
          </label>
          <label class="range-field">
            <span>高斯模糊 <output>{{ appearance.modalBlur }}px</output></span>
            <input v-model.number="appearance.modalBlur" data-testid="modal-blur" type="range" min="0" max="40" step="1" />
          </label>
        </fieldset>
        <fieldset>
          <legend>文件夹标签栏</legend>
          <label class="color-field">
            <span>玻璃底色</span>
            <span class="color-control">
              <input v-model="appearance.tabColor" data-testid="tab-color" type="color" />
              <code>{{ appearance.tabColor }}</code>
            </span>
          </label>
          <label class="range-field">
            <span>圆角 <output>{{ appearance.tabRadius }}px</output></span>
            <input v-model.number="appearance.tabRadius" data-testid="tab-radius" type="range" min="0" max="28" step="1" />
          </label>
          <label class="range-field">
            <span>透明度 <output>{{ appearance.tabOpacity }}%</output></span>
            <input v-model.number="appearance.tabOpacity" data-testid="tab-opacity" type="range" min="12" max="96" step="1" />
          </label>
          <label class="range-field">
            <span>高斯模糊 <output>{{ appearance.tabBlur }}px</output></span>
            <input v-model.number="appearance.tabBlur" data-testid="tab-blur" type="range" min="0" max="32" step="1" />
          </label>
        </fieldset>
        <fieldset>
          <legend>后台表面</legend>
          <label class="range-field">
            <span>圆角 <output>{{ appearance.adminRadius }}px</output></span>
            <input v-model.number="appearance.adminRadius" data-testid="admin-radius" type="range" min="0" max="20" step="1" />
          </label>
          <label class="range-field">
            <span>透明度 <output>{{ appearance.adminOpacity }}%</output></span>
            <input v-model.number="appearance.adminOpacity" data-testid="admin-opacity" type="range" min="40" max="100" step="1" />
          </label>
          <label class="range-field">
            <span>高斯模糊 <output>{{ appearance.adminBlur }}px</output></span>
            <input v-model.number="appearance.adminBlur" data-testid="admin-blur" type="range" min="0" max="24" step="1" />
          </label>
        </fieldset>
      </div>

      <div data-testid="appearance-preview" class="appearance-preview" :style="previewStyle">
        <nav class="preview-tabs"><span class="active">常用</span><span>开发</span><span>设计</span></nav>
        <div class="preview-search"><Search :size="15" /><span>搜索书签...</span></div>
        <div class="preview-folder">
          <strong>常用工具</strong>
          <div class="preview-links"><span>GitHub</span><span>设计资源</span><span>开发文档</span><span>灵感收藏</span></div>
        </div>
        <div class="preview-modal-backdrop">
          <span class="preview-zone-label">弹窗效果预览</span>
          <div class="preview-modal"><strong>解锁文件夹</strong><span>输入密码后继续访问</span></div>
        </div>
        <div class="preview-admin"><strong>后台表面</strong><span>运营数据与快捷操作</span></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.admin-card {
  margin: 0;
}

.admin-card-head h2 {
  align-items: center;
  display: flex;
  gap: 8px;
}

.preset-group {
  display: flex;
  gap: 4px;
}

.preset-group button {
  align-items: center;
  border: 1px solid #dbe3ee;
  color: #475569;
  display: inline-flex;
  font-size: 12px;
  gap: 5px;
  min-height: 32px;
  padding: 0 10px;
}

.preset-group button:first-child {
  border-radius: 7px 0 0 7px;
}

.preset-group button:last-child {
  border-radius: 0 7px 7px 0;
}

.preset-group button + button {
  margin-left: -5px;
}

.preset-group button:hover {
  background: #f8fafc;
  color: var(--nono-accent);
  position: relative;
}

.appearance-layout {
  align-items: stretch;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(300px, 0.9fr) minmax(320px, 1.1fr);
}

.appearance-controls {
  display: grid;
  gap: 18px;
}

fieldset {
  border: 0;
  border-top: 1px solid #e5e7eb;
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 16px 0 0;
}

legend {
  align-items: center;
  color: #0f172a;
  display: flex;
  font-size: 13px;
  font-weight: 750;
  gap: 7px;
  margin-bottom: 4px;
  padding-right: 10px;
}

.range-field {
  display: grid;
  gap: 7px;
}

.color-field {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.color-field > span:first-child {
  color: #475569;
  font-size: 12px;
}

.color-control {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

.color-control input {
  background: transparent;
  border: 0;
  cursor: pointer;
  height: 30px;
  padding: 0;
  width: 38px;
}

.color-control code {
  color: #64748b;
  font-size: 11px;
  min-width: 62px;
}

.range-field span {
  color: #475569;
  display: flex;
  font-size: 12px;
  justify-content: space-between;
}

.range-field output {
  color: var(--nono-accent);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.range-field input {
  accent-color: var(--nono-accent);
  cursor: pointer;
  width: 100%;
}

.appearance-preview {
  align-content: start;
  background:
    linear-gradient(140deg, rgba(15, 118, 110, 0.28), rgba(15, 23, 42, 0.2)),
    var(--preview-bg);
  border-radius: 8px;
  color: #ffffff;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 520px;
  overflow: hidden;
  padding: 28px;
  position: relative;
}

.appearance-preview::before {
  background-image: radial-gradient(circle at 78% 20%, rgba(103, 232, 249, 0.24), transparent 30%);
  content: '';
  inset: 0;
  pointer-events: none;
  position: absolute;
}

.preview-tabs,
.preview-search,
.preview-folder,
.preview-modal-backdrop,
.preview-admin {
  position: relative;
}

.preview-tabs {
  align-items: center;
  backdrop-filter: blur(var(--public-tab-blur));
  background: rgba(var(--public-tab-color-rgb), var(--public-tab-opacity));
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--public-tab-radius);
  display: flex;
  gap: 4px;
  grid-column: 1 / -1;
  padding: 5px;
}

.preview-tabs span {
  color: var(--public-category-text);
  border-radius: calc(var(--public-tab-radius) - 4px);
  font-size: 11px;
  padding: 6px 12px;
}

.preview-tabs .active {
  background: rgba(255, 255, 255, 0.2);
  font-weight: 750;
}

.preview-search {
  align-items: center;
  backdrop-filter: blur(var(--public-search-blur));
  background: rgba(var(--public-search-color-rgb), var(--public-search-opacity));
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--public-search-radius);
  display: flex;
  font-size: 12px;
  gap: 8px;
  grid-column: 1 / -1;
  min-height: 42px;
  padding: 0 14px;
  color: var(--public-bookmark-text);
}

.preview-folder {
  backdrop-filter: blur(var(--public-card-blur));
  background: rgba(var(--public-card-color-rgb), var(--public-card-opacity));
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: var(--public-card-radius);
  display: grid;
  gap: 14px;
  padding: 18px;
}

.preview-admin {
  backdrop-filter: blur(var(--admin-surface-blur));
  background: rgba(255, 255, 255, var(--admin-surface-opacity));
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: var(--admin-surface-radius);
  color: #17211d;
  display: grid;
  gap: 7px;
  padding: 18px;
}

.preview-admin span,
.preview-modal span {
  font-size: 11px;
  opacity: 0.72;
}

.preview-modal-backdrop {
  align-items: center;
  background: rgba(7, 10, 14, 0.5);
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  display: grid;
  gap: 8px;
  grid-column: 1 / -1;
  justify-items: center;
  min-height: 130px;
  padding: 14px 18px 18px;
}

.preview-zone-label {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  font-weight: 700;
  justify-self: start;
  letter-spacing: 0.04em;
}

.preview-modal {
  backdrop-filter: blur(var(--public-modal-blur));
  background: rgba(var(--public-card-color-rgb), var(--public-modal-opacity));
  border: 1px solid rgba(51, 65, 61, 0.2);
  border-radius: var(--public-modal-radius);
  box-shadow:
    0 18px 42px rgba(5, 15, 18, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  color: #17211d;
  display: grid;
  gap: 7px;
  justify-self: center;
  max-width: 260px;
  padding: 18px;
  width: 100%;
}

.preview-folder strong {
  color: var(--public-category-text);
  font-size: 14px;
}

.preview-links {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.preview-links span {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: var(--public-bookmark-text);
  font-size: 11px;
  overflow: hidden;
  padding: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .appearance-layout {
    grid-template-columns: 1fr;
  }

  .appearance-preview {
    min-height: 500px;
  }
}

@media (max-width: 640px) {
  .admin-card-head {
    align-items: stretch;
    flex-direction: column;
  }

  .preset-group {
    width: 100%;
  }

  .preset-group button {
    flex: 1;
    justify-content: center;
  }

  .appearance-preview {
    grid-template-columns: 1fr;
    min-height: 620px;
    padding: 18px;
  }

  .preview-folder,
  .preview-admin {
    grid-column: 1 / -1;
  }
}
</style>
