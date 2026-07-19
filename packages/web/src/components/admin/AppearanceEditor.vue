<script setup lang="ts">
import { Gauge, LayoutGrid, RotateCcw, Search, SlidersHorizontal, Type } from 'lucide-vue-next';
import { appearanceDefaults, type AppearanceSettings } from '@/utils/appearance';

const props = defineProps<{ appearance: AppearanceSettings }>();

function applyPreset(preset: 'performance' | 'balanced' | 'clear') {
  const values = {
    performance: {
      cardRadius: 6, cardOpacity: 72, cardBlur: 0,
      searchRadius: 24, searchOpacity: 62, searchBlur: 0,
    },
    balanced: {
      cardRadius: appearanceDefaults.cardRadius,
      cardOpacity: appearanceDefaults.cardOpacity,
      cardBlur: appearanceDefaults.cardBlur,
      searchRadius: appearanceDefaults.searchRadius,
      searchOpacity: appearanceDefaults.searchOpacity,
      searchBlur: appearanceDefaults.searchBlur,
    },
    clear: {
      cardRadius: 12, cardOpacity: 22, cardBlur: 22,
      searchRadius: 30, searchOpacity: 30, searchBlur: 26,
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
      <h2><SlidersHorizontal :size="18" /> 玻璃质感</h2>
      <div class="preset-group" aria-label="外观预设">
        <button type="button" @click="applyPreset('performance')"><Gauge :size="15" /> 性能</button>
        <button type="button" @click="applyPreset('balanced')">均衡</button>
        <button type="button" @click="applyPreset('clear')">通透</button>
        <button class="reset-appearance" type="button" title="恢复默认外观" aria-label="恢复默认外观" @click="resetAppearance">
          <RotateCcw :size="15" />
        </button>
      </div>
    </header>

    <div class="appearance-controls">
      <fieldset>
        <legend><Search :size="16" /> 导航玻璃</legend>
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
        <legend><LayoutGrid :size="16" /> 内容玻璃</legend>
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

      <fieldset class="text-settings">
        <legend><Type :size="16" /> 文字</legend>
        <div class="text-setting-row">
          <strong>Notab</strong>
          <label class="color-field compact">
            <span>颜色</span>
            <span class="color-control">
              <input v-model="appearance.notabTextColor" data-testid="notab-text-color" type="color" />
              <code>{{ appearance.notabTextColor }}</code>
            </span>
          </label>
          <label class="range-field compact">
            <span>字号 <output>{{ appearance.notabTextSize }}px</output></span>
            <input v-model.number="appearance.notabTextSize" data-testid="notab-text-size" type="range" min="12" max="18" step="1" />
          </label>
        </div>
        <div class="text-setting-row">
          <strong>文件夹标签</strong>
          <label class="color-field compact">
            <span>颜色</span>
            <span class="color-control">
              <input v-model="appearance.folderTextColor" data-testid="folder-text-color" type="color" />
              <code>{{ appearance.folderTextColor }}</code>
            </span>
          </label>
          <label class="range-field compact">
            <span>字号 <output>{{ appearance.folderTextSize }}px</output></span>
            <input v-model.number="appearance.folderTextSize" data-testid="folder-text-size" type="range" min="12" max="22" step="1" />
          </label>
        </div>
        <div class="text-setting-row">
          <strong>书签</strong>
          <label class="color-field compact">
            <span>颜色</span>
            <span class="color-control">
              <input v-model="appearance.bookmarkTextColor" data-testid="bookmark-text-color" type="color" />
              <code>{{ appearance.bookmarkTextColor }}</code>
            </span>
          </label>
          <label class="range-field compact">
            <span>字号 <output>{{ appearance.bookmarkTextSize }}px</output></span>
            <input v-model.number="appearance.bookmarkTextSize" data-testid="bookmark-text-size" type="range" min="12" max="18" step="1" />
          </label>
        </div>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.admin-card {
  margin: 0;
}

.appearance-editor {
  box-sizing: border-box;
  display: grid;
  gap: 16px;
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.admin-card-head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.admin-card-head h2 {
  color: #0f172a;
  font-size: 14px;
  margin: 0;
}

.admin-card-head h2,
legend {
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

.appearance-controls {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 100%;
  min-width: 0;
}

fieldset {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 14px;
  margin: 0;
  max-width: 100%;
  min-width: 0;
  padding: 18px;
}

legend {
  color: #0f172a;
  font-size: 13px;
  font-weight: 750;
  padding: 0 8px;
}

.range-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.color-field {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.color-field > span:first-child,
.range-field span {
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
  display: flex;
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
  min-width: 0;
  width: 100%;
}

.text-settings {
  grid-column: 1 / -1;
}

.text-setting-row {
  align-items: center;
  border-top: 1px solid #e5e7eb;
  display: grid;
  gap: 18px;
  grid-template-columns: 120px minmax(190px, 0.8fr) minmax(220px, 1.2fr);
  min-width: 0;
  padding-top: 14px;
}

.text-setting-row:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.text-setting-row strong {
  color: #0f172a;
  font-size: 13px;
}

.compact {
  min-width: 0;
}

@media (max-width: 820px) {
  .appearance-controls {
    grid-template-columns: 1fr;
  }

  .text-settings {
    grid-column: auto;
  }

  .text-setting-row {
    align-items: stretch;
    grid-template-columns: 1fr;
    gap: 10px;
  }
}

@media (max-width: 640px) {
  .admin-card-head,
  .preset-group {
    align-items: stretch;
    flex-wrap: wrap;
  }

  fieldset {
    padding: 14px;
  }
}
</style>
