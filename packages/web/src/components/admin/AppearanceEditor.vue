<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ChevronRight, Gauge, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-vue-next';
import { useI18n } from '@/composables/useI18n';
import type { MessageKey } from '@/locales';
import {
  APPEARANCE_FIELDS,
  APPEARANCE_GROUPS,
  DENSITY_PRESETS,
  EDITABLE_APPEARANCE_KEYS,
  GLASS_PRESETS,
  appearanceDefaults,
  fieldAppliesToScene,
  type AppearanceGroup,
  type AppearanceKey,
  type AppearanceSettings,
  type DensityPreset,
  type GlassPreset,
} from '@/utils/appearance';
import type { SceneKind } from '@/utils/sceneParticles';

const props = defineProps<{
  appearance: AppearanceSettings;
  /** Narrows the scene group to the controls the selected theme's scene actually uses. */
  sceneKind?: SceneKind;
}>();

const { t } = useI18n();

/** Groups start open; the advanced block inside each one starts closed. */
const openGroups = reactive<Record<string, boolean>>(
  Object.fromEntries(APPEARANCE_GROUPS.map((group) => [group, true])),
);
const openAdvanced = reactive<Record<string, boolean>>({});
const query = ref('');

const normalizedQuery = computed(() => query.value.trim().toLowerCase());
const searching = computed(() => normalizedQuery.value.length > 0);

function fieldLabel(key: AppearanceKey) {
  return t(`appearance.fields.${key}` as MessageKey);
}

function groupLabel(group: AppearanceGroup) {
  return t(`appearance.groups.${group}` as MessageKey);
}

function optionLabel(key: AppearanceKey, option: string) {
  return t(`appearance.options.${key}.${option}` as MessageKey);
}

/** Keys in a group that apply to the current scene, split into the always-open and advanced sets. */
function groupKeys(group: AppearanceGroup, advanced: boolean) {
  return EDITABLE_APPEARANCE_KEYS.filter((key) => {
    const field = APPEARANCE_FIELDS[key];
    if (field.group !== group) return false;
    if (Boolean(field.advanced) !== advanced) return false;
    return fieldAppliesToScene(key, props.sceneKind);
  });
}

function allGroupKeys(group: AppearanceGroup) {
  return EDITABLE_APPEARANCE_KEYS.filter((key) => APPEARANCE_FIELDS[key].group === group);
}

/** While searching, the label is matched so a control can be found without knowing its group. */
function matchesQuery(key: AppearanceKey) {
  if (!searching.value) return true;
  return fieldLabel(key).toLowerCase().includes(normalizedQuery.value);
}

function visibleKeys(group: AppearanceGroup, advanced: boolean) {
  return groupKeys(group, advanced).filter(matchesQuery);
}

/** A group is rendered when it still has something to show under the current search. */
const visibleGroups = computed(() => APPEARANCE_GROUPS.filter((group) => (
  visibleKeys(group, false).length > 0 || visibleKeys(group, true).length > 0
)));

const changedKeys = computed(() => new Set(
  EDITABLE_APPEARANCE_KEYS.filter((key) => props.appearance[key] !== appearanceDefaults[key]),
));

function changedInGroup(group: AppearanceGroup) {
  return allGroupKeys(group).filter((key) => changedKeys.value.has(key)).length;
}

function resetGroup(group: AppearanceGroup) {
  // A per-key copy keeps the reactive object identity, which is what the live preview watches.
  const restored: Partial<AppearanceSettings> = {};
  for (const key of allGroupKeys(group)) {
    Object.assign(restored, { [key]: appearanceDefaults[key] });
  }
  Object.assign(props.appearance, restored);
}

function resetAll() {
  if (!window.confirm(t('appearance.editor.resetAllConfirm'))) return;
  Object.assign(props.appearance, appearanceDefaults);
}

function applyDensity(preset: DensityPreset) {
  props.appearance.density = preset;
  Object.assign(props.appearance, DENSITY_PRESETS[preset]);
}

function applyGlassPreset(preset: GlassPreset) {
  Object.assign(props.appearance, GLASS_PRESETS[preset]);
}

/** Shows the value the way the control means it, rather than the raw stored number. */
function displayValue(key: AppearanceKey) {
  const field = APPEARANCE_FIELDS[key];
  if (field.kind !== 'number') return '';
  const value = props.appearance[key] as number;
  switch (field.format) {
    case 'px': return `${value}px`;
    case 'percent': return `${value}%`;
    case 'ratio': return `${value}%`;
    case 'scale': return `${(value / 100).toFixed(2)}×`;
    default: return String(value);
  }
}

function rangeStyle(key: AppearanceKey) {
  const field = APPEARANCE_FIELDS[key];
  if (field.kind !== 'number') return {};
  const value = props.appearance[key] as number;
  const progress = ((value - field.min) / (field.max - field.min)) * 100;
  return { '--range-progress': `${Math.min(100, Math.max(0, progress))}%` };
}

function numberField(key: AppearanceKey) {
  const field = APPEARANCE_FIELDS[key];
  return field.kind === 'number' ? field : null;
}

function enumOptions(key: AppearanceKey): readonly string[] {
  const field = APPEARANCE_FIELDS[key];
  return field.kind === 'enum' ? field.options : [];
}

function fieldKind(key: AppearanceKey) {
  return APPEARANCE_FIELDS[key].kind;
}
</script>

<template>
  <section class="admin-card appearance-editor" data-testid="appearance-editor">
    <header class="admin-card-head">
      <h2><SlidersHorizontal :size="18" /> {{ t('appearance.glass') }}</h2>
      <div class="head-tools">
        <label class="settings-search">
          <Search :size="14" />
          <input
            v-model="query"
            data-testid="appearance-search"
            type="search"
            :placeholder="t('appearance.editor.searchPlaceholder')"
          />
          <button
            v-if="searching"
            type="button"
            class="search-clear"
            :aria-label="t('appearance.editor.searchClear')"
            @click="query = ''"
          >
            <X :size="13" />
          </button>
        </label>
        <button
          class="reset-all"
          type="button"
          data-testid="appearance-reset-all"
          :title="t('appearance.editor.resetAll')"
          @click="resetAll"
        >
          <RotateCcw :size="14" /> {{ t('appearance.editor.resetAll') }}
        </button>
      </div>
    </header>

    <p class="editor-hint">{{ t('appearance.editor.livePreview') }}</p>

    <p v-if="!visibleGroups.length" class="editor-empty" data-testid="appearance-search-empty">
      {{ t('appearance.editor.searchNoMatch') }}
    </p>

    <div class="group-list">
      <section
        v-for="group in visibleGroups"
        :key="group"
        class="setting-group"
        :data-testid="`appearance-group-${group}`"
      >
        <header class="group-head">
          <button
            type="button"
            class="group-toggle"
            :aria-expanded="openGroups[group] || searching"
            @click="openGroups[group] = !openGroups[group]"
          >
            <ChevronRight class="chevron" :class="{ open: openGroups[group] || searching }" :size="14" />
            <strong>{{ groupLabel(group) }}</strong>
          </button>
          <span v-if="changedInGroup(group)" class="group-changed">
            {{ t('appearance.editor.changedCount', { count: changedInGroup(group) }) }}
          </span>
          <button
            type="button"
            class="group-reset"
            :data-testid="`appearance-reset-${group}`"
            :title="t('appearance.editor.resetGroup')"
            :aria-label="`${t('appearance.editor.resetGroup')}: ${groupLabel(group)}`"
            @click="resetGroup(group)"
          >
            <RotateCcw :size="13" />
          </button>
        </header>

        <div v-show="openGroups[group] || searching" class="group-body">
          <!-- Quick presets seed a group's values; every one stays adjustable afterwards. -->
          <div v-if="group === 'layout' && !searching" class="preset-row">
            <div class="preset-group" :aria-label="t('appearance.fields.density')">
              <button
                v-for="preset in (['compact', 'balanced', 'spacious'] as DensityPreset[])"
                :key="preset"
                type="button"
                :class="{ active: appearance.density === preset }"
                :data-testid="`density-${preset}`"
                @click="applyDensity(preset)"
              >
                {{ optionLabel('density', preset) }}
              </button>
            </div>
            <small>{{ t('appearance.editor.densityHint') }}</small>
          </div>

          <div v-if="group === 'glass' && !searching" class="preset-row">
            <div class="preset-group" :aria-label="t('appearance.presetsAria')">
              <button type="button" data-testid="glass-performance" @click="applyGlassPreset('performance')">
                <Gauge :size="13" /> {{ t('appearance.glassPerformance') }}
              </button>
              <button type="button" data-testid="glass-balanced" @click="applyGlassPreset('balanced')">
                {{ t('appearance.glassBalanced') }}
              </button>
              <button type="button" data-testid="glass-clear" @click="applyGlassPreset('clear')">
                {{ t('appearance.glassClear') }}
              </button>
            </div>
            <small>{{ t('appearance.editor.densityHint') }}</small>
          </div>

          <small v-if="group === 'scene' && !searching" class="group-note">
            {{ t('appearance.editor.sceneHint') }}
          </small>
          <small v-if="group === 'background' && !searching" class="group-note">
            {{ t('appearance.editor.backgroundHint') }}
          </small>

          <div class="control-grid">
            <template v-for="key in visibleKeys(group, false)" :key="key">
              <label
                class="control"
                :class="`control-${fieldKind(key)}`"
                :data-testid="`control-${key}`"
                :data-changed="changedKeys.has(key) ? 'true' : undefined"
              >
                <span class="control-label">
                  {{ fieldLabel(key) }}
                  <em v-if="changedKeys.has(key)" class="changed-dot" :title="t('appearance.editor.changed')">
                    {{ t('appearance.editor.changed') }}
                  </em>
                  <output v-if="fieldKind(key) === 'number'">{{ displayValue(key) }}</output>
                </span>

                <input
                  v-if="fieldKind(key) === 'number'"
                  v-model.number="appearance[key] as number"
                  type="range"
                  :min="numberField(key)?.min"
                  :max="numberField(key)?.max"
                  :step="numberField(key)?.step ?? 1"
                  :style="rangeStyle(key)"
                />
                <span v-else-if="fieldKind(key) === 'color'" class="color-control">
                  <input v-model="appearance[key] as string" type="color" />
                  <code>{{ appearance[key] }}</code>
                </span>
                <input
                  v-else-if="fieldKind(key) === 'toggle'"
                  v-model="appearance[key] as boolean"
                  type="checkbox"
                  class="control-switch"
                />
                <select v-else v-model="appearance[key] as string">
                  <option v-for="option in enumOptions(key)" :key="option" :value="option">
                    {{ optionLabel(key, option) }}
                  </option>
                </select>
              </label>
            </template>
          </div>

          <!-- Advanced controls stay folded away so the common set is not buried. -->
          <div v-if="visibleKeys(group, true).length" class="advanced-block">
            <button
              type="button"
              class="advanced-toggle"
              :data-testid="`appearance-advanced-${group}`"
              :aria-expanded="openAdvanced[group] || searching"
              @click="openAdvanced[group] = !openAdvanced[group]"
            >
              <ChevronRight class="chevron" :class="{ open: openAdvanced[group] || searching }" :size="13" />
              {{ t('appearance.editor.advanced') }}
              <span class="advanced-count">{{ visibleKeys(group, true).length }}</span>
            </button>

            <div v-show="openAdvanced[group] || searching" class="control-grid">
              <template v-for="key in visibleKeys(group, true)" :key="key">
                <label
                  class="control"
                  :class="`control-${fieldKind(key)}`"
                  :data-testid="`control-${key}`"
                  :data-changed="changedKeys.has(key) ? 'true' : undefined"
                >
                  <span class="control-label">
                    {{ fieldLabel(key) }}
                    <em v-if="changedKeys.has(key)" class="changed-dot" :title="t('appearance.editor.changed')">
                      {{ t('appearance.editor.changed') }}
                    </em>
                    <output v-if="fieldKind(key) === 'number'">{{ displayValue(key) }}</output>
                  </span>

                  <input
                    v-if="fieldKind(key) === 'number'"
                    v-model.number="appearance[key] as number"
                    type="range"
                    :min="numberField(key)?.min"
                    :max="numberField(key)?.max"
                    :step="numberField(key)?.step ?? 1"
                    :style="rangeStyle(key)"
                  />
                  <span v-else-if="fieldKind(key) === 'color'" class="color-control">
                    <input v-model="appearance[key] as string" type="color" />
                    <code>{{ appearance[key] }}</code>
                  </span>
                  <input
                    v-else-if="fieldKind(key) === 'toggle'"
                    v-model="appearance[key] as boolean"
                    type="checkbox"
                    class="control-switch"
                  />
                  <select v-else v-model="appearance[key] as string">
                    <option v-for="option in enumOptions(key)" :key="option" :value="option">
                      {{ optionLabel(key, option) }}
                    </option>
                  </select>
                </label>
              </template>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.appearance-editor {
  --ae-text: #0f172a;
  --ae-muted: #475569;
  --ae-subtle: var(--admin-text-muted);
  --ae-line: var(--admin-border);
  --ae-hover: #f8fafc;
  --ae-track: #cbd5e1;
  --ae-accent: var(--admin-accent);
  --ae-thumb-ring: var(--admin-surface-elevated);
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
  display: grid;
  gap: 10px;
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.admin-card-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
}

.admin-card-head h2 {
  align-items: center;
  color: var(--ae-text);
  display: flex;
  font-size: 13px;
  gap: 8px;
  margin: 0;
}

.head-tools {
  align-items: center;
  display: flex;
  gap: 6px;
  min-width: 0;
}

.settings-search {
  align-items: center;
  border: 1px solid var(--ae-line);
  border-radius: 7px;
  color: var(--ae-muted);
  display: inline-flex;
  gap: 5px;
  min-height: 28px;
  min-width: 0;
  padding: 0 7px;
}

.settings-search input {
  background: transparent;
  border: 0;
  color: var(--ae-text);
  font: inherit;
  font-size: 11.5px;
  min-width: 0;
  outline: 0;
  width: 116px;
}

.settings-search input::-webkit-search-cancel-button {
  display: none;
}

.search-clear,
.reset-all,
.group-reset,
.advanced-toggle,
.group-toggle {
  background: transparent;
  border: 0;
  color: var(--ae-muted);
  cursor: pointer;
  font: inherit;
}

.reset-all {
  align-items: center;
  border: 1px solid var(--ae-line);
  border-radius: 7px;
  display: inline-flex;
  font-size: 11px;
  gap: 4px;
  min-height: 28px;
  padding: 0 8px;
}

.reset-all:hover,
.group-reset:hover,
.search-clear:hover {
  color: var(--nono-accent);
}

.editor-hint,
.editor-empty,
.group-note {
  color: var(--ae-subtle);
  font-size: 11px;
  margin: 0;
}

.editor-empty {
  padding: 12px 0;
  text-align: center;
}

.group-list {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.setting-group {
  border: 1px solid var(--ae-line);
  border-radius: 8px;
  min-width: 0;
  padding: 9px 10px;
}

.group-head {
  align-items: center;
  display: flex;
  gap: 6px;
  min-width: 0;
}

.group-toggle {
  align-items: center;
  display: inline-flex;
  flex: 1;
  gap: 5px;
  min-width: 0;
  text-align: left;
}

.group-toggle strong {
  color: var(--ae-text);
  font-size: 12px;
  font-weight: 750;
}

.chevron {
  flex: 0 0 auto;
  transition: transform 0.18s ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.group-changed {
  background: rgba(var(--accent-rgb, 15, 118, 110), 0.14);
  border-radius: 999px;
  color: var(--ae-accent);
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
}

.group-body {
  display: grid;
  gap: 9px;
  padding-top: 9px;
}

.preset-row {
  display: grid;
  gap: 4px;
}

.preset-row small {
  color: var(--ae-subtle);
  font-size: 10.5px;
}

.preset-group {
  display: flex;
  gap: 3px;
}

.preset-group button {
  align-items: center;
  background: transparent;
  border: 1px solid var(--ae-line);
  color: var(--ae-muted);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 11px;
  gap: 4px;
  min-height: 28px;
  padding: 0 9px;
}

.preset-group button:first-child {
  border-radius: 7px 0 0 7px;
}

.preset-group button:last-child {
  border-radius: 0 7px 7px 0;
}

.preset-group button + button {
  margin-left: -4px;
}

.preset-group button:hover,
.preset-group button.active {
  background: var(--ae-hover);
  color: var(--nono-accent);
  position: relative;
}

.control-grid {
  display: grid;
  gap: 8px 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
}

.control {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.control-label {
  align-items: baseline;
  color: var(--ae-muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  gap: 5px;
  min-width: 0;
}

.control-label output {
  color: var(--ae-text);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

/* A quiet marker, so a wall of controls still shows at a glance which ones were touched. */
.changed-dot {
  background: rgba(var(--accent-rgb, 15, 118, 110), 0.16);
  border-radius: 999px;
  color: var(--ae-accent);
  font-size: 9.5px;
  font-style: normal;
  font-weight: 700;
  padding: 1px 5px;
}

.control-color,
.control-toggle {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.control-color .control-label,
.control-toggle .control-label {
  flex: 1;
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
  width: 34px;
}

.color-control code {
  color: var(--ae-subtle);
  font-size: 10.5px;
}

.control-switch {
  accent-color: var(--ae-accent);
  cursor: pointer;
  flex: 0 0 auto;
  height: 16px;
  width: 30px;
}

.control select {
  background: transparent;
  border: 1px solid var(--ae-line);
  border-radius: 6px;
  color: var(--ae-text);
  font: inherit;
  font-size: 11.5px;
  min-height: 28px;
  min-width: 0;
  padding: 0 6px;
}

.advanced-block {
  border-top: 1px solid var(--ae-line);
  display: grid;
  gap: 8px;
  padding-top: 8px;
}

.advanced-toggle {
  align-items: center;
  display: inline-flex;
  font-size: 11px;
  font-weight: 700;
  gap: 5px;
  justify-self: start;
}

.advanced-toggle:hover {
  color: var(--nono-accent);
}

.advanced-count {
  background: var(--ae-hover);
  border-radius: 999px;
  color: var(--ae-subtle);
  font-size: 10px;
  padding: 1px 6px;
}

.control input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  min-width: 0;
  width: 100%;
}

.control input[type='range']::-webkit-slider-runnable-track {
  background: linear-gradient(90deg, var(--ae-accent) 0 var(--range-progress, 0%), var(--ae-track) var(--range-progress, 0%) 100%);
  border-radius: 999px;
  height: 3px;
}

.control input[type='range']::-webkit-slider-thumb {
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

.control input[type='range']::-moz-range-track {
  background: var(--ae-track);
  border-radius: 999px;
  height: 3px;
}

.control input[type='range']::-moz-range-progress {
  background: var(--ae-accent);
  border-radius: 999px;
  height: 3px;
}

.control input[type='range']::-moz-range-thumb {
  background: var(--ae-accent);
  border: 1px solid var(--ae-thumb-ring);
  border-radius: 50%;
  height: 13px;
  width: 13px;
}

@media (max-width: 680px) {
  .control-grid {
    grid-template-columns: 1fr;
  }

  .head-tools {
    width: 100%;
  }

  .settings-search {
    flex: 1;
  }

  .settings-search input {
    width: 100%;
  }
}
</style>
