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

function rangeStyle(value: number, min: number, max: number) {
  const progress = ((value - min) / (max - min)) * 100;
  return { '--range-progress': `${Math.min(100, Math.max(0, progress))}%` };
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
          <input v-model.number="appearance.searchRadius" data-testid="search-radius" type="range" min="8" max="40" step="1" :style="rangeStyle(appearance.searchRadius, 8, 40)" />
        </label>
        <label class="range-field">
          <span>透明度 <output>{{ appearance.searchOpacity }}%</output></span>
          <input v-model.number="appearance.searchOpacity" data-testid="search-opacity" type="range" min="12" max="90" step="1" :style="rangeStyle(appearance.searchOpacity, 12, 90)" />
        </label>
        <label class="range-field">
          <span>高斯模糊 <output>{{ appearance.searchBlur }}px</output></span>
          <input v-model.number="appearance.searchBlur" data-testid="search-blur" type="range" min="0" max="32" step="1" :style="rangeStyle(appearance.searchBlur, 0, 32)" />
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
          <input v-model.number="appearance.cardRadius" data-testid="card-radius" type="range" min="0" max="24" step="1" :style="rangeStyle(appearance.cardRadius, 0, 24)" />
        </label>
        <label class="range-field">
          <span>透明度 <output>{{ appearance.cardOpacity }}%</output></span>
          <input v-model.number="appearance.cardOpacity" data-testid="card-opacity" type="range" min="12" max="90" step="1" :style="rangeStyle(appearance.cardOpacity, 12, 90)" />
        </label>
        <label class="range-field">
          <span>高斯模糊 <output>{{ appearance.cardBlur }}px</output></span>
          <input v-model.number="appearance.cardBlur" data-testid="card-blur" type="range" min="0" max="32" step="1" :style="rangeStyle(appearance.cardBlur, 0, 32)" />
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
            <input v-model.number="appearance.notabTextSize" data-testid="notab-text-size" type="range" min="12" max="18" step="1" :style="rangeStyle(appearance.notabTextSize, 12, 18)" />
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
            <input v-model.number="appearance.folderTextSize" data-testid="folder-text-size" type="range" min="12" max="22" step="1" :style="rangeStyle(appearance.folderTextSize, 12, 22)" />
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
            <input v-model.number="appearance.bookmarkTextSize" data-testid="bookmark-text-size" type="range" min="12" max="18" step="1" :style="rangeStyle(appearance.bookmarkTextSize, 12, 18)" />
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
  gap: 11px;
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.admin-card-head {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.admin-card-head h2 {
  color: #0f172a;
  font-size: 13px;
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
  gap: 3px;
}

.preset-group button {
  align-items: center;
  border: 1px solid #dbe3ee;
  color: #475569;
  display: inline-flex;
  font-size: 11px;
  gap: 4px;
  min-height: 28px;
  padding: 0 8px;
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
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 100%;
  min-width: 0;
}

fieldset {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 9px;
  margin: 0;
  max-width: 100%;
  min-width: 0;
  padding: 11px;
}

legend {
  color: #0f172a;
  font-size: 12px;
  font-weight: 750;
  padding: 0 6px;
}

.range-field {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.color-field {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.color-field > span:first-child,
.range-field span {
  color: #475569;
  font-size: 11px;
}

.color-control {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.color-control input {
  background: transparent;
  border: 0;
  cursor: pointer;
  height: 24px;
  padding: 0;
  width: 30px;
}

.color-control code {
  color: #64748b;
  font-size: 10px;
  min-width: 56px;
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
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
  height: 13px;
  margin: 0;
  min-width: 0;
  width: 100%;
}

.range-field input::-webkit-slider-runnable-track {
  background: linear-gradient(90deg, #0f766e 0 var(--range-progress, 0%), #cbd5e1 var(--range-progress, 0%) 100%);
  border-radius: 999px;
  height: 3px;
}

.range-field input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  background: #0f766e;
  border: 1px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.2);
  height: 13px;
  margin-top: -5px;
  width: 13px;
}

.range-field input::-moz-range-track {
  background: #cbd5e1;
  border: 0;
  border-radius: 999px;
  height: 3px;
}

.range-field input::-moz-range-progress {
  background: #0f766e;
  border-radius: 999px;
  height: 3px;
}

.range-field input::-moz-range-thumb {
  background: #0f766e;
  border: 1px solid #ffffff;
  border-radius: 50%;
  height: 13px;
  width: 13px;
}

.text-settings {
  grid-column: 1 / -1;
}

.text-setting-row {
  align-items: center;
  border-top: 1px solid #e5e7eb;
  display: grid;
  gap: 12px;
  grid-template-columns: 100px minmax(150px, 0.8fr) minmax(190px, 1.2fr);
  min-width: 0;
  padding-top: 9px;
}

.text-setting-row:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.text-setting-row strong {
  color: #0f172a;
  font-size: 12px;
}

.compact {
  min-width: 0;
}

@media (max-width: 680px) {
  .appearance-controls {
    grid-template-columns: 1fr;
  }

  .text-settings {
    grid-column: auto;
  }

  .text-setting-row {
    align-items: stretch;
    grid-template-columns: 1fr;
    gap: 7px;
  }
}

@media (max-width: 640px) {
  .admin-card-head,
  .preset-group {
    align-items: stretch;
    flex-wrap: wrap;
  }

  fieldset {
    padding: 10px;
  }
}
</style>
