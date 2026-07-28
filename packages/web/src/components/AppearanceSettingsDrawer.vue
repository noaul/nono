<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ArrowUpRight, Check, Languages, Layers, Palette, Plus, Save, Settings, Sliders, Trash2, X } from 'lucide-vue-next';
import AppearanceEditor from '@/components/admin/AppearanceEditor.vue';
import ColorModeControl from '@/components/ColorModeControl.vue';
import LanguageControl from '@/components/LanguageControl.vue';
import { useI18n } from '@/composables/useI18n';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';
import { appearanceDefaults, appearanceSettingsForSave, getAppearanceSettings, type AppearanceSettings } from '@/utils/appearance';
import { getSiteDefaultLocale, type Locale } from '@/utils/locale';
import { PUBLIC_THEMES, accentCssVars, getSceneIntensity, getTheme, type PublicTheme } from '@/utils/themes';

const props = defineProps<{ open: boolean; site: Site }>();
const emit = defineEmits<{
  close: [];
  saved: [site: Site];
}>();

const { t, setSiteDefaultLocale } = useI18n();

const appearance = reactive<AppearanceSettings>({ ...appearanceDefaults });
const theme = reactive({ id: '', accent: '', sceneIntensity: 100 });
const backgroundColor = ref('#090a0f');
const fontColor = ref('#ffffff');
const siteLocale = ref<Locale>('zh');
const saving = ref(false);
const message = ref('');
const error = ref('');
const presetName = ref('');

// Three panels instead of one ~1900px scroll: pick a look, fine-tune the glass, set preferences.
type DrawerTab = 'theme' | 'texture' | 'general';
const activeTab = ref<DrawerTab>('theme');

const tabs = computed(() => [
  { id: 'theme' as const, label: t('appearance.theme'), icon: Palette },
  { id: 'texture' as const, label: t('appearance.glass'), icon: Layers },
  { id: 'general' as const, label: t('appearance.general'), icon: Sliders },
]);

type UserAppearancePreset = {
  id: string;
  name: string;
  appearance: AppearanceSettings;
  theme: { id: string; accent: string };
  backgroundColor: string;
  fontColor: string;
};

const userPresets = ref<UserAppearancePreset[]>([]);

const selectedTheme = computed(() => getTheme(theme.id));
const presetsFull = computed(() => userPresets.value.length >= 3);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readUserPresets(settings?: Record<string, unknown>): UserAppearancePreset[] {
  const raw = settings?.appearancePresets;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).slice(0, 3).map((item, index) => {
    const savedTheme = isRecord(item.theme) ? item.theme : {};
    return {
      id: typeof item.id === 'string' && item.id ? item.id : `preset-${index + 1}`,
      name: typeof item.name === 'string' && item.name.trim()
        ? item.name.trim().slice(0, 20)
        : t('appearance.presetDefaultName', { index: index + 1 }),
      appearance: getAppearanceSettings({ appearance: item.appearance }),
      theme: {
        id: typeof savedTheme.id === 'string' ? savedTheme.id : '',
        accent: typeof savedTheme.accent === 'string' ? savedTheme.accent : '',
      },
      backgroundColor: typeof item.backgroundColor === 'string' ? item.backgroundColor : '#090a0f',
      fontColor: typeof item.fontColor === 'string' ? item.fontColor : '#ffffff',
    };
  });
}

function resetDraft() {
  Object.assign(appearance, getAppearanceSettings(props.site.settings));
  backgroundColor.value = props.site.backgroundColor || '#090a0f';
  fontColor.value = props.site.fontColor || '#ffffff';
  const savedTheme = (props.site.settings as { theme?: { id?: string; accent?: string } } | null)?.theme;
  const resolved = getTheme(savedTheme?.id);
  theme.id = resolved?.id || savedTheme?.id || '';
  theme.accent = savedTheme?.accent || resolved?.accent || '';
  theme.sceneIntensity = getSceneIntensity(props.site.settings);
  siteLocale.value = getSiteDefaultLocale(props.site.settings) || 'zh';
  userPresets.value = readUserPresets(props.site.settings);
  presetName.value = '';
  message.value = '';
  error.value = '';
}

function applyTheme(preset: PublicTheme) {
  theme.id = preset.id;
  theme.accent = preset.accent;
  backgroundColor.value = preset.backgroundColor;
  fontColor.value = preset.fontColor;
  Object.assign(appearance, preset.appearance);
  message.value = '';
}

function themePreviewStyle(preset: PublicTheme) {
  return {
    ...accentCssVars(preset.accent),
    '--theme-bg': preset.backgroundColor,
    '--theme-font': preset.fontColor,
    '--theme-card': preset.appearance.cardColor,
    '--theme-tab': preset.appearance.tabColor,
    '--theme-border': preset.surface.border,
  };
}

function userPresetStyle(preset: UserAppearancePreset) {
  return {
    '--preset-bg': preset.backgroundColor,
    '--preset-text': preset.fontColor,
    '--preset-card': preset.appearance.cardColor,
    '--preset-accent': preset.theme.accent || '#0f766e',
  };
}

function applyUserPreset(preset: UserAppearancePreset) {
  Object.assign(appearance, preset.appearance);
  Object.assign(theme, preset.theme);
  backgroundColor.value = preset.backgroundColor;
  fontColor.value = preset.fontColor;
  message.value = t('appearance.presetApplied', { name: preset.name });
  error.value = '';
}

/** Publishes the site default immediately so the drawer previews the language it will save. */
function previewSiteLocale(next: Locale) {
  siteLocale.value = next;
  setSiteDefaultLocale(next);
  message.value = '';
}

async function persist(successMessage = t('appearance.saved')) {
  if (saving.value) return false;
  saving.value = true;
  message.value = '';
  error.value = '';
  try {
    const updated = await apiRequest<Site>('/api/admin/site', {
      method: 'PUT',
      body: jsonBody({
        backgroundColor: backgroundColor.value,
        fontColor: fontColor.value,
        settings: {
          ...(props.site.settings || {}),
          appearance: appearanceSettingsForSave(appearance),
          theme: { ...theme },
          appearancePresets: userPresets.value,
          i18n: { ...(isRecord(props.site.settings?.i18n) ? props.site.settings.i18n : {}), defaultLocale: siteLocale.value },
        },
      }),
    });
    message.value = successMessage;
    emit('saved', updated);
    return true;
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('common.saveFailed');
    return false;
  } finally {
    saving.value = false;
  }
}

async function save() {
  await persist();
}

async function saveUserPreset() {
  if (saving.value || presetsFull.value) return;
  const name = presetName.value.trim().slice(0, 20)
    || t('appearance.presetDefaultName', { index: userPresets.value.length + 1 });
  const preset: UserAppearancePreset = {
    id: `preset-${Date.now()}-${userPresets.value.length + 1}`,
    name,
    appearance: appearanceSettingsForSave({ ...appearance }),
    theme: { ...theme },
    backgroundColor: backgroundColor.value,
    fontColor: fontColor.value,
  };
  userPresets.value.push(preset);
  presetName.value = '';
  if (!await persist(t('appearance.presetSaved', { name }))) {
    userPresets.value = userPresets.value.filter((item) => item.id !== preset.id);
  }
}

async function removeUserPreset(preset: UserAppearancePreset) {
  if (saving.value) return;
  const previous = [...userPresets.value];
  userPresets.value = userPresets.value.filter((item) => item.id !== preset.id);
  if (!await persist(t('appearance.presetRemoved', { name: preset.name }))) userPresets.value = previous;
}

function onKeydown(event: KeyboardEvent) {
  if (props.open && event.key === 'Escape') emit('close');
}

watch(() => props.open, (open) => {
  if (open) resetDraft();
}, { immediate: true });

window.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Transition name="appearance-drawer">
    <div v-if="open" class="appearance-backdrop" data-testid="appearance-settings-drawer" @click.self="emit('close')">
      <aside class="appearance-drawer" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
        <header class="drawer-header">
          <div>
            <span><Settings :size="15" /> {{ t('appearance.eyebrow') }}</span>
            <h2 id="appearance-title">{{ t('appearance.title') }}</h2>
          </div>
          <button
            class="drawer-icon-button"
            type="button"
            :title="t('common.close')"
            :aria-label="t('appearance.closeLabel')"
            @click="emit('close')"
          >
            <X :size="19" />
          </button>
        </header>

        <nav class="drawer-tabs" role="tablist" :aria-label="t('appearance.title')">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            class="drawer-tab"
            :class="{ active: activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            :data-testid="`drawer-tab-${tab.id}`"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" :size="15" />
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <!-- Panels stay mounted and toggle with v-show, so switching tabs keeps every draft
             edit and scroll position instead of remounting the editors. -->
        <div class="drawer-scroll">
          <div v-show="activeTab === 'theme'" class="drawer-panel" role="tabpanel">
            <section class="theme-section">
              <div class="drawer-section-title">
                <h3><Palette :size="16" /> {{ t('appearance.theme') }}</h3>
                <span v-if="selectedTheme"><Check :size="14" /> {{ selectedTheme.name }}</span>
              </div>
              <div class="theme-wall">
                <button
                  v-for="preset in PUBLIC_THEMES"
                  :key="preset.id"
                  type="button"
                  class="theme-card"
                  :class="[`theme-${preset.scene.kind}`, { active: theme.id === preset.id }]"
                  :style="themePreviewStyle(preset)"
                  :data-testid="`theme-${preset.id}`"
                  @click="applyTheme(preset)"
                >
                  <span class="theme-motion" aria-hidden="true"></span>
                  <span class="theme-swatch">
                    <span class="theme-swatch-tab"></span>
                    <span class="theme-swatch-card"></span>
                    <span class="theme-swatch-accent"></span>
                  </span>
                  <strong>{{ preset.name }}</strong>
                  <small>{{ preset.description }}</small>
                </button>
              </div>
              <label class="scene-intensity-field" data-testid="scene-intensity-field">
                <span>
                  {{ t('appearance.sceneIntensity') }}
                  <output>{{ theme.sceneIntensity > 0 ? `${theme.sceneIntensity}%` : t('appearance.sceneIntensityOff') }}</output>
                </span>
                <input
                  v-model.number="theme.sceneIntensity"
                  data-testid="scene-intensity"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                />
                <small>{{ t('appearance.sceneIntensityHint') }}</small>
              </label>
            </section>

            <section class="user-preset-section">
              <div class="drawer-section-title">
                <h3><Save :size="16" /> {{ t('appearance.presets') }}</h3>
                <span>{{ userPresets.length }}/3</span>
              </div>
              <div v-if="userPresets.length" class="user-preset-list">
                <article v-for="preset in userPresets" :key="preset.id" class="user-preset" :style="userPresetStyle(preset)">
                  <button
                    class="user-preset-apply"
                    type="button"
                    :title="t('common.apply')"
                    @click="applyUserPreset(preset)"
                  >
                    <span class="user-preset-swatch" aria-hidden="true">
                      <i></i><i></i><i></i>
                    </span>
                    <strong>{{ preset.name }}</strong>
                  </button>
                  <button
                    class="user-preset-delete"
                    type="button"
                    :title="t('appearance.presetDeleteLabel', { name: preset.name })"
                    :aria-label="t('appearance.presetDeleteLabel', { name: preset.name })"
                    @click="removeUserPreset(preset)"
                  >
                    <Trash2 :size="15" />
                  </button>
                </article>
              </div>
              <form class="preset-create" data-testid="save-appearance-preset" @submit.prevent="saveUserPreset">
                <input
                  v-model="presetName"
                  data-testid="appearance-preset-name"
                  maxlength="20"
                  :placeholder="t('appearance.presetNamePlaceholder')"
                  :disabled="saving || presetsFull"
                />
                <button
                  data-testid="save-appearance-preset-button"
                  type="submit"
                  :disabled="saving || presetsFull"
                >
                  <Plus :size="15" /> {{ t('appearance.presetSaveCurrent') }}
                </button>
              </form>
              <small v-if="presetsFull" class="field-hint">{{ t('appearance.presetLimit') }}</small>
            </section>
          </div>

          <div v-show="activeTab === 'texture'" class="drawer-panel" role="tabpanel">
            <AppearanceEditor :appearance="appearance" />
          </div>

          <div v-show="activeTab === 'general'" class="drawer-panel" role="tabpanel">
            <section class="preference-section">
              <div class="drawer-section-title">
                <h3><Palette :size="16" /> {{ t('colorMode.label') }}</h3>
              </div>
              <ColorModeControl variant="segmented" />
            </section>

            <section class="preference-section">
              <div class="drawer-section-title">
                <h3><Languages :size="16" /> {{ t('language.label') }}</h3>
              </div>
              <LanguageControl variant="segmented" />
              <small class="field-hint">{{ t('language.visitorHint') }}</small>
            </section>

            <section class="preference-section">
              <div class="drawer-section-title">
                <h3><Languages :size="16" /> {{ t('language.siteDefault') }}</h3>
              </div>
              <div class="site-locale-segments" role="group" :aria-label="t('language.siteDefault')">
                <button
                  v-for="option in (['zh', 'en'] as Locale[])"
                  :key="option"
                  type="button"
                  :class="{ active: siteLocale === option }"
                  :aria-pressed="siteLocale === option"
                  :data-testid="`site-locale-${option}`"
                  @click="previewSiteLocale(option)"
                >
                  {{ option === 'zh' ? t('language.zh') : t('language.en') }}
                </button>
              </div>
              <small class="field-hint">{{ t('language.siteDefaultHint') }}</small>
            </section>
          </div>
        </div>

        <footer class="drawer-footer">
          <div class="drawer-feedback" aria-live="polite">
            <span v-if="message" class="success">{{ message }}</span>
            <span v-else-if="error" class="error">{{ error }}</span>
          </div>
          <div class="drawer-actions">
            <a data-testid="appearance-admin-link" href="/admin" target="_blank" rel="noreferrer">
              {{ t('appearance.adminEntry') }} <ArrowUpRight :size="16" />
            </a>
            <button data-testid="appearance-save" type="button" :disabled="saving" @click="save">
              <Save :size="16" /> {{ saving ? t('common.saving') : t('appearance.saveAppearance') }}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
/* One palette for the whole drawer so dark mode is a single override block below. */
.appearance-drawer {
  --drawer-bg: rgba(248, 250, 252, 0.94);
  --drawer-border: rgba(255, 255, 255, 0.82);
  --drawer-text: #0f172a;
  --drawer-strong: #334155;
  --drawer-muted: #475569;
  --drawer-subtle: #64748b;
  --drawer-faint: #94a3b8;
  --drawer-line: #dbe3ee;
  --drawer-divider: rgba(203, 213, 225, 0.72);
  --drawer-surface: #ffffff;
  --drawer-input: rgba(255, 255, 255, 0.82);
  --drawer-chip: rgba(226, 232, 240, 0.64);
  --drawer-footer: rgba(248, 250, 252, 0.82);
  --drawer-accent: #0f766e;
  --drawer-accent-ink: #ffffff;
  --drawer-success: #047857;
  --drawer-danger: #be123c;
  --drawer-shadow: -24px 0 64px rgba(15, 23, 42, 0.22);
}

/* The whole selector must sit inside :global(): with `:global(x) .y` the scoped-CSS compiler
   drops the descendant part and the override lands on <html> instead of the drawer. */
:global([data-color-mode='dark'] .appearance-drawer) {
  --drawer-bg: rgba(17, 19, 24, 0.95);
  --drawer-border: rgba(255, 255, 255, 0.1);
  --drawer-text: #f1f5f9;
  --drawer-strong: #e2e8f0;
  --drawer-muted: #b6c2d2;
  --drawer-subtle: #93a1b5;
  --drawer-faint: #74839a;
  --drawer-line: rgba(255, 255, 255, 0.14);
  --drawer-divider: rgba(255, 255, 255, 0.12);
  --drawer-surface: rgba(255, 255, 255, 0.07);
  --drawer-input: rgba(255, 255, 255, 0.06);
  --drawer-chip: rgba(255, 255, 255, 0.08);
  --drawer-footer: rgba(13, 15, 19, 0.86);
  --drawer-accent: #2dd4bf;
  --drawer-accent-ink: #04241f;
  --drawer-success: #34d399;
  --drawer-danger: #fb7185;
  --drawer-shadow: -24px 0 64px rgba(0, 0, 0, 0.5);
}

.appearance-backdrop {
  background: rgba(15, 23, 42, 0.2);
  inset: 0;
  overflow: hidden;
  position: fixed;
  z-index: 80;
}

:global([data-color-mode='dark'] .appearance-backdrop) {
  background: rgba(0, 0, 0, 0.46);
}

.appearance-drawer {
  background: var(--drawer-bg);
  border-left: 1px solid var(--drawer-border);
  box-shadow: var(--drawer-shadow);
  color: var(--drawer-text);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  height: 100dvh;
  margin-left: auto;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  width: min(512px, 100vw);
  -webkit-backdrop-filter: blur(28px) saturate(1.16);
  backdrop-filter: blur(28px) saturate(1.16);
}

.drawer-header,
.drawer-footer {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  padding: 12px 16px;
}

.drawer-header {
  border-bottom: 1px solid var(--drawer-divider);
}

.drawer-header > div {
  display: grid;
  gap: 2px;
}

.drawer-header span,
.drawer-section-title span {
  align-items: center;
  color: var(--drawer-subtle);
  display: inline-flex;
  font-size: 10px;
  font-weight: 700;
  gap: 6px;
}

.drawer-header h2 {
  font-size: 18px;
  line-height: 1.2;
  margin: 0;
}

.drawer-icon-button {
  align-items: center;
  background: var(--drawer-chip);
  border: 1px solid var(--drawer-line);
  border-radius: 8px;
  color: var(--drawer-muted);
  display: inline-flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  width: 32px;
}

/* Tabs replace the single long scroll; each panel now fits in roughly one screen. */
.drawer-tabs {
  border-bottom: 1px solid var(--drawer-divider);
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 8px 16px;
}

.drawer-tab {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--drawer-muted);
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  gap: 6px;
  justify-content: center;
  min-height: 34px;
  padding: 0 8px;
  transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease;
}

.drawer-tab:hover,
.drawer-tab:focus-visible {
  background: var(--drawer-chip);
  color: var(--drawer-text);
}

.drawer-tab.active {
  background: var(--drawer-surface);
  border-color: var(--drawer-line);
  color: var(--drawer-accent);
}

.drawer-scroll {
  box-sizing: border-box;
  display: grid;
  gap: 14px;
  max-width: 100%;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 14px 16px 16px;
}

.drawer-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.theme-section {
  display: grid;
  gap: 8px;
}

.theme-section,
.user-preset-section,
.preference-section,
.theme-wall,
.user-preset-list {
  max-width: 100%;
  min-width: 0;
}

.preference-section {
  display: grid;
  gap: 8px;
}

.drawer-section-title {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.drawer-section-title h3 {
  align-items: center;
  display: inline-flex;
  font-size: 13px;
  gap: 6px;
  margin: 0;
}

.field-hint {
  color: var(--drawer-faint);
  font-size: 10px;
}

.site-locale-segments {
  background: var(--drawer-chip);
  border: 1px solid var(--drawer-line);
  border-radius: 8px;
  display: grid;
  gap: 3px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 3px;
}

.site-locale-segments button {
  border-radius: 6px;
  color: var(--drawer-muted);
  font-size: 13px;
  font-weight: 650;
  min-height: 34px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.site-locale-segments button.active {
  background: var(--drawer-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  color: var(--drawer-accent);
}

.theme-wall {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.theme-card {
  background: var(--theme-bg, #0b0d12);
  border: 1px solid color-mix(in srgb, var(--theme-border, #fff) 40%, transparent);
  border-radius: 8px;
  color: var(--theme-font, #f3f4f6);
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 3px;
  isolation: isolate;
  justify-items: start;
  min-height: 78px;
  overflow: hidden;
  padding: 8px;
  position: relative;
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.theme-card:hover,
.theme-card:focus-visible {
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
  outline: none;
  transform: translateY(-2px);
}

.theme-card.active {
  border-color: var(--accent, #10b981);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 16, 185, 129), 0.2);
}

.theme-motion {
  background:
    radial-gradient(circle at 24% 28%, rgba(255, 255, 255, 0.88) 0 2px, transparent 3px),
    radial-gradient(circle at 72% 62%, rgba(255, 255, 255, 0.64) 0 3px, transparent 4px),
    linear-gradient(125deg, transparent 18%, rgba(255, 255, 255, 0.2), transparent 72%);
  inset: 0;
  opacity: 0.65;
  overflow: hidden;
  position: absolute;
  z-index: -1;
}

/* Each preset card runs a tiny always-on preview of its own scene animation. */
.theme-motion::before,
.theme-motion::after {
  content: '';
  position: absolute;
}

.theme-bubbles .theme-motion::before {
  animation: preview-rise 4.2s linear infinite;
  background: radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.92) 0 18%, rgba(255, 255, 255, 0.2) 46%, transparent 70%);
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 50%;
  bottom: -14px;
  height: 11px;
  left: 22%;
  width: 11px;
}

.theme-bubbles .theme-motion::after {
  animation: preview-rise 5.1s linear 1.6s infinite;
  background: radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.92) 0 18%, rgba(255, 255, 255, 0.2) 46%, transparent 70%);
  border: 1px solid rgba(255, 255, 255, 0.52);
  border-radius: 50%;
  bottom: -10px;
  height: 7px;
  right: 24%;
  width: 7px;
}

.theme-snow .theme-motion::before,
.theme-snow .theme-motion::after {
  color: rgba(255, 255, 255, 0.92);
  content: '❄';
  font-size: 9px;
  line-height: 1;
  top: -12px;
}

.theme-snow .theme-motion::before {
  animation: preview-fall 4.6s linear infinite;
  left: 28%;
}

.theme-snow .theme-motion::after {
  animation: preview-fall 5.4s linear 2.1s infinite;
  font-size: 7px;
  right: 26%;
}

.theme-leaves .theme-motion::before,
.theme-leaves .theme-motion::after {
  background: linear-gradient(135deg, #b5d88c 0%, #2d7951 100%);
  border-radius: 100% 0 100% 0;
  height: 9px;
  top: -12px;
  width: 9px;
}

.theme-leaves .theme-motion::before {
  animation: preview-fall 4.8s linear infinite;
  left: 30%;
}

.theme-leaves .theme-motion::after {
  animation: preview-fall 5.6s linear 2.3s infinite;
  background: linear-gradient(135deg, #e1b268 0%, #7f4936 100%);
  height: 7px;
  right: 28%;
  width: 7px;
}

.theme-stars .theme-motion::before,
.theme-stars .theme-motion::after {
  background: #fff7dc;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(255, 231, 164, 0.9);
  height: 3px;
  width: 3px;
}

.theme-stars .theme-motion::before {
  animation: preview-twinkle 2.2s ease-in-out infinite alternate;
  left: 30%;
  top: 34%;
}

.theme-stars .theme-motion::after {
  animation: preview-twinkle 2.8s ease-in-out 0.9s infinite alternate;
  right: 26%;
  top: 20%;
}

.theme-sunbeams .theme-motion::before {
  animation: preview-sweep 5s ease-in-out infinite alternate;
  background: linear-gradient(115deg, transparent 32%, rgba(255, 250, 198, 0.5) 50%, transparent 68%);
  inset: -30%;
}

.theme-rain .theme-motion::before,
.theme-rain .theme-motion::after {
  background: linear-gradient(180deg, transparent, rgba(226, 248, 250, 0.85));
  height: 14px;
  top: -16px;
  width: 1px;
}

.theme-rain .theme-motion::before {
  animation: preview-rain 1.6s linear infinite;
  left: 32%;
}

.theme-rain .theme-motion::after {
  animation: preview-rain 2s linear 0.7s infinite;
  right: 30%;
}

.theme-swatch {
  align-items: center;
  display: flex;
  gap: 4px;
  margin-bottom: 1px;
}

.theme-swatch-tab {
  background: color-mix(in srgb, var(--theme-tab, #f7f8fb) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-font, #fff) 18%, transparent);
  border-radius: 999px;
  display: inline-block;
  height: 7px;
  width: 28px;
}

.theme-swatch-card {
  background: color-mix(in srgb, var(--theme-card, #f7f8fb) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-font, #fff) 24%, transparent);
  border-radius: 3px;
  display: inline-block;
  height: 13px;
  width: 18px;
}

.theme-swatch-accent {
  background: var(--accent, #10b981);
  border-radius: 50%;
  display: inline-block;
  height: 10px;
  width: 10px;
}

.theme-card strong {
  font-size: 11px;
  font-weight: 800;
}

.theme-card small {
  font-size: 9px;
  line-height: 1.25;
  opacity: 0.74;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.scene-intensity-field {
  display: grid;
  gap: 5px;
  margin-top: 2px;
}

.scene-intensity-field > span {
  color: var(--drawer-muted);
  display: flex;
  font-size: 12px;
  font-weight: 700;
  justify-content: space-between;
}

.scene-intensity-field output {
  color: var(--drawer-accent);
  font-variant-numeric: tabular-nums;
}

.scene-intensity-field input {
  accent-color: var(--drawer-accent);
  cursor: pointer;
  width: 100%;
}

.scene-intensity-field > small {
  color: var(--drawer-faint);
  font-size: 10px;
}

.user-preset-section {
  display: grid;
  gap: 7px;
}

.preset-create {
  display: grid;
  gap: 6px;
  grid-template-columns: minmax(0, 1fr) auto;
}

.preset-create input,
.preset-create button {
  border: 1px solid var(--drawer-line);
  border-radius: 8px;
  font: inherit;
  min-height: 32px;
}

.preset-create input {
  background: var(--drawer-input);
  color: var(--drawer-text);
  min-width: 0;
  padding: 0 11px;
}

.preset-create button {
  align-items: center;
  background: var(--drawer-surface);
  color: var(--drawer-accent);
  display: inline-flex;
  font-size: 11px;
  font-weight: 750;
  gap: 6px;
  padding: 0 10px;
}

.preset-create input:disabled,
.preset-create button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.user-preset-list {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.user-preset {
  align-items: center;
  background: color-mix(in srgb, var(--preset-bg) 10%, var(--drawer-surface));
  border: 1px solid var(--drawer-line);
  border-radius: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  min-width: 0;
  overflow: hidden;
}

.user-preset-apply {
  align-items: center;
  color: var(--drawer-strong);
  display: flex;
  gap: 7px;
  min-height: 38px;
  min-width: 0;
  padding: 4px 8px;
  text-align: left;
}

.user-preset-apply strong {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-preset-swatch {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(3, 6px);
}

.user-preset-swatch i {
  background: var(--preset-bg);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.14);
  display: block;
  height: 14px;
  width: 14px;
}

.user-preset-swatch i:nth-child(2) { background: var(--preset-card); }
.user-preset-swatch i:nth-child(3) { background: var(--preset-accent); }

.user-preset-delete {
  align-items: center;
  color: var(--drawer-faint);
  display: inline-flex;
  height: 30px;
  justify-content: center;
  padding: 0;
  width: 30px;
}

.user-preset-delete:hover,
.user-preset-delete:focus-visible {
  color: var(--drawer-danger);
}

.drawer-footer {
  background: var(--drawer-footer);
  border-top: 1px solid var(--drawer-divider);
}

.drawer-feedback {
  font-size: 12px;
  min-width: 0;
}

.drawer-feedback .success { color: var(--drawer-success); }
.drawer-feedback .error { color: var(--drawer-danger); }

.drawer-actions {
  display: flex;
  gap: 6px;
}

.drawer-actions a,
.drawer-actions button {
  align-items: center;
  border-radius: 8px;
  display: inline-flex;
  font-size: 11px;
  font-weight: 750;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
}

.drawer-actions a {
  background: var(--drawer-surface);
  border: 1px solid var(--drawer-line);
  color: var(--drawer-strong);
}

.drawer-actions button {
  background: var(--drawer-accent);
  border: 1px solid var(--drawer-accent);
  color: var(--drawer-accent-ink);
}

.drawer-actions button:disabled {
  cursor: wait;
  opacity: 0.6;
}

:deep(.appearance-editor) {
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.appearance-drawer-enter-active,
.appearance-drawer-leave-active {
  transition: background-color 0.24s ease;
}

.appearance-drawer-enter-active .appearance-drawer,
.appearance-drawer-leave-active .appearance-drawer {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.appearance-drawer-enter-from,
.appearance-drawer-leave-to {
  background: rgba(15, 23, 42, 0);
}

.appearance-drawer-enter-from .appearance-drawer,
.appearance-drawer-leave-to .appearance-drawer {
  transform: translateX(100%);
}

@keyframes preview-rise {
  0% { opacity: 0; transform: translateY(0) scale(0.8); }
  16% { opacity: 0.92; }
  100% { opacity: 0; transform: translateY(-96px) scale(1.05); }
}

@keyframes preview-fall {
  0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(0deg); }
  14% { opacity: 0.92; }
  100% { opacity: 0; transform: translate3d(8px, 100px, 0) rotate(160deg); }
}

@keyframes preview-twinkle {
  from { opacity: 0.2; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1.35); }
}

@keyframes preview-sweep {
  from { transform: translate3d(-16%, 0, 0); }
  to { transform: translate3d(16%, 0, 0); }
}

@keyframes preview-rain {
  0% { opacity: 0; transform: translateY(0); }
  16% { opacity: 0.85; }
  100% { opacity: 0; transform: translateY(104px); }
}

@media (max-width: 640px) {
  .theme-wall {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .drawer-header,
  .drawer-footer,
  .drawer-tabs {
    padding-left: 12px;
    padding-right: 12px;
  }

  .drawer-header,
  .drawer-footer {
    padding-bottom: 10px;
    padding-top: 10px;
  }

  .drawer-scroll {
    padding: 12px 12px 12px;
  }

  .drawer-tab {
    font-size: 11px;
    gap: 4px;
  }

  .drawer-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .drawer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .preset-create,
  .user-preset-list {
    grid-template-columns: 1fr;
  }

  .drawer-actions a,
  .drawer-actions button {
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .appearance-drawer-enter-active,
  .appearance-drawer-leave-active,
  .appearance-drawer-enter-active .appearance-drawer,
  .appearance-drawer-leave-active .appearance-drawer {
    animation: none;
    transition: none;
  }

  .drawer-tab {
    transition: none;
  }

  .theme-motion::before,
  .theme-motion::after {
    animation: none;
    opacity: 0.4;
  }
}
</style>
