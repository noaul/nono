<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ArrowUpRight, Check, Palette, Plus, Save, Settings, Trash2, X } from 'lucide-vue-next';
import AppearanceEditor from '@/components/admin/AppearanceEditor.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';
import { appearanceDefaults, appearanceSettingsForSave, getAppearanceSettings, type AppearanceSettings } from '@/utils/appearance';
import { PUBLIC_THEMES, accentCssVars, getTheme, type PublicTheme } from '@/utils/themes';

const props = defineProps<{ open: boolean; site: Site }>();
const emit = defineEmits<{
  close: [];
  saved: [site: Site];
}>();

const appearance = reactive<AppearanceSettings>({ ...appearanceDefaults });
const theme = reactive({ id: '', accent: '' });
const backgroundColor = ref('#090a0f');
const fontColor = ref('#ffffff');
const saving = ref(false);
const message = ref('');
const error = ref('');
const presetName = ref('');

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
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 20) : `我的预设 ${index + 1}`,
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
  message.value = `已应用“${preset.name}”`;
  error.value = '';
}

async function persist(successMessage = '外观已保存') {
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
        },
      }),
    });
    message.value = successMessage;
    emit('saved', updated);
    return true;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '保存失败';
    return false;
  } finally {
    saving.value = false;
  }
}

async function save() {
  await persist();
}

async function saveUserPreset() {
  if (saving.value || userPresets.value.length >= 3) return;
  const name = presetName.value.trim().slice(0, 20) || `我的预设 ${userPresets.value.length + 1}`;
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
  if (!await persist(`预设“${name}”已保存`)) userPresets.value = userPresets.value.filter((item) => item.id !== preset.id);
}

async function removeUserPreset(preset: UserAppearancePreset) {
  if (saving.value) return;
  const previous = [...userPresets.value];
  userPresets.value = userPresets.value.filter((item) => item.id !== preset.id);
  if (!await persist(`预设“${preset.name}”已删除`)) userPresets.value = previous;
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
            <span><Settings :size="15" /> 主页设置</span>
            <h2 id="appearance-title">外观设置</h2>
          </div>
          <button class="drawer-icon-button" type="button" title="关闭" aria-label="关闭外观设置" @click="emit('close')">
            <X :size="19" />
          </button>
        </header>

        <div class="drawer-scroll">
          <section class="theme-section">
            <div class="drawer-section-title">
              <h3><Palette :size="16" /> 主题</h3>
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
          </section>

          <section class="user-preset-section">
            <div class="drawer-section-title">
              <h3><Save :size="16" /> 我的预设</h3>
              <span>{{ userPresets.length }}/3</span>
            </div>
            <form class="preset-create" data-testid="save-appearance-preset" @submit.prevent="saveUserPreset">
              <input
                v-model="presetName"
                data-testid="appearance-preset-name"
                maxlength="20"
                placeholder="预设名称"
                :disabled="saving || userPresets.length >= 3"
              />
              <button
                data-testid="save-appearance-preset-button"
                type="submit"
                :disabled="saving || userPresets.length >= 3"
              >
                <Plus :size="15" /> 保存当前
              </button>
            </form>
            <div v-if="userPresets.length" class="user-preset-list">
              <article v-for="preset in userPresets" :key="preset.id" class="user-preset" :style="userPresetStyle(preset)">
                <button class="user-preset-apply" type="button" :title="`应用 ${preset.name}`" @click="applyUserPreset(preset)">
                  <span class="user-preset-swatch" aria-hidden="true">
                    <i></i><i></i><i></i>
                  </span>
                  <strong>{{ preset.name }}</strong>
                </button>
                <button class="user-preset-delete" type="button" :title="`删除 ${preset.name}`" :aria-label="`删除 ${preset.name}`" @click="removeUserPreset(preset)">
                  <Trash2 :size="15" />
                </button>
              </article>
            </div>
          </section>

          <AppearanceEditor :appearance="appearance" />
        </div>

        <footer class="drawer-footer">
          <div class="drawer-feedback" aria-live="polite">
            <span v-if="message" class="success">{{ message }}</span>
            <span v-else-if="error" class="error">{{ error }}</span>
          </div>
          <div class="drawer-actions">
            <a data-testid="appearance-admin-link" href="/admin" target="_blank" rel="noreferrer">
              后台管理 <ArrowUpRight :size="16" />
            </a>
            <button data-testid="appearance-save" type="button" :disabled="saving" @click="save">
              <Save :size="16" /> {{ saving ? '保存中' : '保存外观' }}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.appearance-backdrop {
  background: rgba(15, 23, 42, 0.2);
  inset: 0;
  overflow: hidden;
  position: fixed;
  z-index: 80;
}

.appearance-drawer {
  background: rgba(248, 250, 252, 0.94);
  border-left: 1px solid rgba(255, 255, 255, 0.82);
  box-shadow: -24px 0 64px rgba(15, 23, 42, 0.22);
  color: #0f172a;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100dvh;
  margin-left: auto;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  width: min(640px, 100vw);
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
  border-bottom: 1px solid rgba(203, 213, 225, 0.72);
}

.drawer-header > div {
  display: grid;
  gap: 2px;
}

.drawer-header span,
.drawer-section-title span {
  align-items: center;
  color: #64748b;
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
  background: rgba(226, 232, 240, 0.64);
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 8px;
  color: #475569;
  display: inline-flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  width: 32px;
}

.drawer-scroll {
  box-sizing: border-box;
  display: grid;
  gap: 12px;
  max-width: 100%;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 16px 16px;
}

.theme-section {
  display: grid;
  gap: 8px;
}

.theme-section,
.user-preset-section,
.theme-wall,
.user-preset-list {
  max-width: 100%;
  min-width: 0;
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
  position: absolute;
  z-index: -1;
}

.theme-card:hover .theme-motion {
  animation: theme-preview-motion 2.8s ease-in-out infinite alternate;
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
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  font: inherit;
  min-height: 32px;
}

.preset-create input {
  background: rgba(255, 255, 255, 0.82);
  color: #0f172a;
  min-width: 0;
  padding: 0 11px;
}

.preset-create button {
  align-items: center;
  background: #ffffff;
  color: #0f766e;
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
  background: color-mix(in srgb, var(--preset-bg) 10%, #ffffff);
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  min-width: 0;
  overflow: hidden;
}

.user-preset-apply {
  align-items: center;
  color: #334155;
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
  color: #94a3b8;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  padding: 0;
  width: 30px;
}

.user-preset-delete:hover,
.user-preset-delete:focus-visible {
  color: #be123c;
}

.drawer-footer {
  background: rgba(248, 250, 252, 0.82);
  border-top: 1px solid rgba(203, 213, 225, 0.72);
}

.drawer-feedback {
  font-size: 12px;
  min-width: 0;
}

.drawer-feedback .success { color: #047857; }
.drawer-feedback .error { color: #be123c; }

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
  background: #ffffff;
  border: 1px solid #dbe3ee;
  color: #334155;
}

.drawer-actions button {
  background: #0f766e;
  border: 1px solid #0f766e;
  color: #ffffff;
}

.drawer-actions button:disabled {
  cursor: wait;
  opacity: 0.6;
}

:deep(.appearance-editor) {
  border-top: 1px solid #e2e8f0;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  padding-top: 12px;
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

@keyframes theme-preview-motion {
  from { transform: translate3d(-2%, 2%, 0) scale(1.02); }
  to { transform: translate3d(2%, -2%, 0) scale(1.08); }
}

@media (max-width: 640px) {
  .theme-wall {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .drawer-header,
  .drawer-footer {
    padding: 10px 12px;
  }

  .drawer-scroll {
    padding: 10px 12px 12px;
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
  .appearance-drawer-leave-active .appearance-drawer,
  .theme-card:hover .theme-motion {
    animation: none;
    transition: none;
  }
}
</style>
