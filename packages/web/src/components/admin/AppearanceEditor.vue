<script setup lang="ts">
import { Gauge, LayoutGrid, RotateCcw, Search, SlidersHorizontal, Type } from 'lucide-vue-next';
import { useI18n } from '@/composables/useI18n';
import { appearanceDefaults, type AppearanceSettings } from '@/utils/appearance';

const props = defineProps<{ appearance: AppearanceSettings }>();

const { t } = useI18n();

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
      <h2><SlidersHorizontal :size="18" /> {{ t('appearance.glass') }}</h2>
      <div class="preset-group" :aria-label="t('appearance.presetsAria')">
        <button type="button" @click="applyPreset('performance')"><Gauge :size="15" /> {{ t('appearance.glassPerformance') }}</button>
        <button type="button" @click="applyPreset('balanced')">{{ t('appearance.glassBalanced') }}</button>
        <button type="button" @click="applyPreset('clear')">{{ t('appearance.glassClear') }}</button>
        <button class="reset-appearance" type="button" :title="t('appearance.glassReset')" :aria-label="t('appearance.glassReset')" @click="resetAppearance">
          <RotateCcw :size="15" />
        </button>
      </div>
    </header>

    <div class="appearance-controls">
      <fieldset>
        <legend><Search :size="16" /> {{ t('appearance.navGlass') }}</legend>
        <label class="color-field">
          <span>{{ t('appearance.glassBase') }}</span>
          <span class="color-control">
            <input v-model="appearance.searchColor" data-testid="search-color" type="color" />
            <code>{{ appearance.searchColor }}</code>
          </span>
        </label>
        <label class="range-field">
          <span>{{ t('appearance.radius') }} <output>{{ appearance.searchRadius }}px</output></span>
          <input v-model.number="appearance.searchRadius" data-testid="search-radius" type="range" min="8" max="40" step="1" :style="rangeStyle(appearance.searchRadius, 8, 40)" />
        </label>
        <label class="range-field">
          <span>{{ t('appearance.opacity') }} <output>{{ appearance.searchOpacity }}%</output></span>
          <input v-model.number="appearance.searchOpacity" data-testid="search-opacity" type="range" min="12" max="90" step="1" :style="rangeStyle(appearance.searchOpacity, 12, 90)" />
        </label>
        <label class="range-field">
          <span>{{ t('appearance.blur') }} <output>{{ appearance.searchBlur }}px</output></span>
          <input v-model.number="appearance.searchBlur" data-testid="search-blur" type="range" min="0" max="32" step="1" :style="rangeStyle(appearance.searchBlur, 0, 32)" />
        </label>
      </fieldset>

      <fieldset>
        <legend><LayoutGrid :size="16" /> {{ t('appearance.contentGlass') }}</legend>
        <label class="color-field">
          <span>{{ t('appearance.glassBase') }}</span>
          <span class="color-control">
            <input v-model="appearance.cardColor" data-testid="card-color" type="color" />
            <code>{{ appearance.cardColor }}</code>
          </span>
        </label>
        <label class="range-field">
          <span>{{ t('appearance.radius') }} <output>{{ appearance.cardRadius }}px</output></span>
          <input v-model.number="appearance.cardRadius" data-testid="card-radius" type="range" min="0" max="24" step="1" :style="rangeStyle(appearance.cardRadius, 0, 24)" />
        </label>
        <label class="range-field">
          <span>{{ t('appearance.opacity') }} <output>{{ appearance.cardOpacity }}%</output></span>
          <input v-model.number="appearance.cardOpacity" data-testid="card-opacity" type="range" min="12" max="90" step="1" :style="rangeStyle(appearance.cardOpacity, 12, 90)" />
        </label>
        <label class="range-field">
          <span>{{ t('appearance.blur') }} <output>{{ appearance.cardBlur }}px</output></span>
          <input v-model.number="appearance.cardBlur" data-testid="card-blur" type="range" min="0" max="32" step="1" :style="rangeStyle(appearance.cardBlur, 0, 32)" />
        </label>
      </fieldset>

      <fieldset class="text-settings">
        <legend><Type :size="16" /> {{ t('appearance.text') }}</legend>
        <div class="text-setting-row">
          <strong>Notab</strong>
          <label class="color-field compact">
            <span>{{ t('appearance.textColor') }}</span>
            <span class="color-control">
              <input v-model="appearance.notabTextColor" data-testid="notab-text-color" type="color" />
              <code>{{ appearance.notabTextColor }}</code>
            </span>
          </label>
          <label class="range-field compact">
            <span>{{ t('appearance.textSize') }} <output>{{ appearance.notabTextSize }}px</output></span>
            <input v-model.number="appearance.notabTextSize" data-testid="notab-text-size" type="range" min="12" max="18" step="1" :style="rangeStyle(appearance.notabTextSize, 12, 18)" />
          </label>
        </div>
        <div class="text-setting-row">
          <strong>{{ t('appearance.folderLabel') }}</strong>
          <label class="color-field compact">
            <span>{{ t('appearance.textColor') }}</span>
            <span class="color-control">
              <input v-model="appearance.folderTextColor" data-testid="folder-text-color" type="color" />
              <code>{{ appearance.folderTextColor }}</code>
            </span>
          </label>
          <label class="range-field compact">
            <span>{{ t('appearance.textSize') }} <output>{{ appearance.folderTextSize }}px</output></span>
            <input v-model.number="appearance.folderTextSize" data-testid="folder-text-size" type="range" min="12" max="22" step="1" :style="rangeStyle(appearance.folderTextSize, 12, 22)" />
          </label>
        </div>
        <div class="text-setting-row">
          <strong>{{ t('appearance.bookmark') }}</strong>
          <label class="color-field compact">
            <span>{{ t('appearance.textColor') }}</span>
            <span class="color-control">
              <input v-model="appearance.bookmarkTextColor" data-testid="bookmark-text-color" type="color" />
              <code>{{ appearance.bookmarkTextColor }}</code>
            </span>
          </label>
          <label class="range-field compact">
            <span>{{ t('appearance.textSize') }} <output>{{ appearance.bookmarkTextSize }}px</output></span>
            <input v-model.number="appearance.bookmarkTextSize" data-testid="bookmark-text-size" type="range" min="12" max="18" step="1" :style="rangeStyle(appearance.bookmarkTextSize, 12, 18)" />
          </label>
        </div>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.appearance-editor {
  --ae-text: #0f172a;
  --ae-muted: #475569;
  --ae-subtle: #64748b;
  --ae-line: #e2e8f0;
  --ae-hover: #f8fafc;
  --ae-track: #cbd5e1;
  --ae-accent: #0f766e;
  --ae-thumb-ring: #ffffff;
}

/* The whole selector stays inside :global(): `:global(x) .y` loses the descendant part. */
:global([data-color-mode='dark'] .appearance-editor) {
  --ae-text: #f1f5f9;
  --ae-muted: #b6c2d2;
  --ae-subtle: #93a1b5;
  --ae-line: rgba(255, 255, 255, 0.14);
  --ae-hover: rgba(255, 255, 255, 0.08);
  --ae-track: rgba(255, 255, 255, 0.2);
  --ae-accent: #2dd4bf;
  --ae-thumb-ring: rgba(0, 0, 0, 0.5);
}

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
  color: var(--ae-text);
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
  border: 1px solid var(--ae-line);
  color: var(--ae-muted);
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
  background: var(--ae-hover);
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
  border: 1px solid var(--ae-line);
  border-radius: 8px;
  display: grid;
  gap: 9px;
  margin: 0;
  max-width: 100%;
  min-width: 0;
  padding: 11px;
}

legend {
  color: var(--ae-text);
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
  color: var(--ae-muted);
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
  color: var(--ae-subtle);
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
  background: linear-gradient(90deg, var(--ae-accent) 0 var(--range-progress, 0%), var(--ae-track) var(--range-progress, 0%) 100%);
  border-radius: 999px;
  height: 3px;
}

.range-field input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  background: var(--ae-accent);
  border: 1px solid var(--ae-thumb-ring);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.2);
  height: 13px;
  margin-top: -5px;
  width: 13px;
}

.range-field input::-moz-range-track {
  background: var(--ae-track);
  border: 0;
  border-radius: 999px;
  height: 3px;
}

.range-field input::-moz-range-progress {
  background: var(--ae-accent);
  border-radius: 999px;
  height: 3px;
}

.range-field input::-moz-range-thumb {
  background: var(--ae-accent);
  border: 1px solid var(--ae-thumb-ring);
  border-radius: 50%;
  height: 13px;
  width: 13px;
}

.text-settings {
  grid-column: 1 / -1;
}

.text-setting-row {
  align-items: center;
  border-top: 1px solid var(--ae-line);
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
  color: var(--ae-text);
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
