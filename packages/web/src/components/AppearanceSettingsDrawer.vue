<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ArrowUpRight, Check, Palette, Save, Settings, X } from 'lucide-vue-next';
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

const selectedTheme = computed(() => getTheme(theme.id));

function resetDraft() {
  Object.assign(appearance, getAppearanceSettings(props.site.settings));
  backgroundColor.value = props.site.backgroundColor || '#090a0f';
  fontColor.value = props.site.fontColor || '#ffffff';
  const savedTheme = (props.site.settings as { theme?: { id?: string; accent?: string } } | null)?.theme;
  const resolved = getTheme(savedTheme?.id);
  theme.id = resolved?.id || savedTheme?.id || '';
  theme.accent = savedTheme?.accent || resolved?.accent || '';
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

async function save() {
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
        },
      }),
    });
    message.value = '外观已保存';
    emit('saved', updated);
  } catch (event) {
    error.value = event instanceof Error ? event.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (props.open && event.key === 'Escape') emit('close');
}

watch(() => [props.open, props.site], ([open]) => {
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
  width: min(560px, 100vw);
  -webkit-backdrop-filter: blur(28px) saturate(1.16);
  backdrop-filter: blur(28px) saturate(1.16);
}

.drawer-header,
.drawer-footer {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 18px 20px;
}

.drawer-header {
  border-bottom: 1px solid rgba(203, 213, 225, 0.72);
}

.drawer-header > div {
  display: grid;
  gap: 4px;
}

.drawer-header span,
.drawer-section-title span {
  align-items: center;
  color: #64748b;
  display: inline-flex;
  font-size: 11px;
  font-weight: 700;
  gap: 6px;
}

.drawer-header h2 {
  font-size: 20px;
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
  height: 36px;
  justify-content: center;
  padding: 0;
  width: 36px;
}

.drawer-scroll {
  display: grid;
  gap: 18px;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 24px;
}

.theme-section {
  display: grid;
  gap: 12px;
}

.drawer-section-title {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.drawer-section-title h3 {
  align-items: center;
  display: inline-flex;
  font-size: 14px;
  gap: 7px;
  margin: 0;
}

.theme-wall {
  display: grid;
  gap: 9px;
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
  gap: 5px;
  isolation: isolate;
  justify-items: start;
  min-height: 104px;
  overflow: hidden;
  padding: 11px;
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
  gap: 5px;
  margin-bottom: 3px;
}

.theme-swatch-tab {
  background: color-mix(in srgb, var(--theme-tab, #f7f8fb) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-font, #fff) 18%, transparent);
  border-radius: 999px;
  display: inline-block;
  height: 9px;
  width: 34px;
}

.theme-swatch-card {
  background: color-mix(in srgb, var(--theme-card, #f7f8fb) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-font, #fff) 24%, transparent);
  border-radius: 3px;
  display: inline-block;
  height: 16px;
  width: 22px;
}

.theme-swatch-accent {
  background: var(--accent, #10b981);
  border-radius: 50%;
  display: inline-block;
  height: 12px;
  width: 12px;
}

.theme-card strong {
  font-size: 12px;
  font-weight: 800;
}

.theme-card small {
  font-size: 10px;
  line-height: 1.35;
  opacity: 0.74;
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
  gap: 8px;
}

.drawer-actions a,
.drawer-actions button {
  align-items: center;
  border-radius: 8px;
  display: inline-flex;
  font-size: 12px;
  font-weight: 750;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
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
  padding-top: 18px;
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
    padding: 14px 16px;
  }

  .drawer-scroll {
    padding: 16px;
  }

  .drawer-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .drawer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
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
