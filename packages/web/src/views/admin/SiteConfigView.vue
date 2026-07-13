<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ArrowUpRight, Image, Link2, Palette, Plus, Save, Search, Trash2 } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import AppearanceEditor from '@/components/admin/AppearanceEditor.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';
import { appearanceDefaults, getAppearanceSettings, type AppearanceSettings } from '@/utils/appearance';
import { getPortalSettings, portalDefaults } from '@/utils/portal';
import { getSearchEngineSettings, type SearchEngineSettings } from '@/utils/searchEngines';
import { PUBLIC_THEMES, accentCssVars, type PublicTheme } from '@/utils/themes';

const form = reactive({
  name: '',
  description: '',
  slug: 'admin',
  backgroundImage: '',
  backgroundColor: '#000000',
  fontColor: '#ffffff',
  searchUrlTemplate: 'https://www.google.com/search?q={query}',
  localSearchFirst: true,
  settings: {} as Record<string, unknown>,
});
const appearance = reactive<AppearanceSettings>({ ...appearanceDefaults });
const portal = reactive({ ...portalDefaults });
const theme = reactive({ id: '', accent: '' });
const searchEngines = reactive<SearchEngineSettings>({ defaultId: 'default', items: [] });
const message = ref('');
const error = ref('');
const saving = ref(false);

function applyTheme(preset: PublicTheme) {
  theme.id = preset.id;
  theme.accent = preset.accent;
  form.backgroundColor = preset.backgroundColor;
  form.fontColor = preset.fontColor;
  Object.assign(appearance, preset.appearance);
}

function themePreviewStyle(preset: PublicTheme) {
  return {
    ...accentCssVars(preset.accent),
    '--theme-bg': preset.backgroundColor,
    '--theme-font': preset.fontColor,
    '--theme-card': preset.appearance.cardColor,
    '--theme-search': preset.appearance.searchColor,
  };
}

onMounted(async () => {
  const site = await apiRequest<Site>('/api/admin/site');
  Object.assign(form, site, { settings: { ...(site.settings || {}) } });
  Object.assign(appearance, getAppearanceSettings(site.settings));
  Object.assign(portal, getPortalSettings(site.settings, import.meta.env.VITE_BLOG_URL));
  const savedSearchEngines = getSearchEngineSettings(site.settings, site.searchUrlTemplate);
  searchEngines.defaultId = savedSearchEngines.defaultId;
  searchEngines.items = savedSearchEngines.items.map((item) => ({
    ...item,
    template: item.template || site.searchUrlTemplate,
  }));
  const savedTheme = (site.settings as { theme?: { id?: string; accent?: string } } | null)?.theme;
  if (savedTheme) Object.assign(theme, { id: savedTheme.id || '', accent: savedTheme.accent || '' });
});

async function save() {
  error.value = '';
  message.value = '';
  saving.value = true;
  try {
    const payload = {
      ...form,
      settings: {
        ...form.settings,
        appearance: { ...appearance },
        portal: { ...portal },
        theme: { ...theme },
        searchEngines: {
          defaultId: searchEngines.defaultId,
          items: searchEngines.items.map((item) => ({
            ...item,
            label: item.label.trim(),
            short: item.short.trim(),
            template: String(item.template || '').trim(),
          })),
        },
      },
    };
    const site = await apiRequest<Site>('/api/admin/site', { method: 'PUT', body: jsonBody(payload) });
    Object.assign(form, site, { settings: { ...payload.settings, ...(site.settings || {}) } });
    message.value = '已保存';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

function addSearchEngine() {
  const id = `custom-${Date.now()}-${searchEngines.items.length + 1}`;
  searchEngines.items.push({
    id,
    label: '自定义搜索',
    short: '搜',
    template: 'https://example.com/search?q={query}',
    enabled: true,
  });
}

function removeSearchEngine(id: string) {
  if (searchEngines.items.length <= 1) return;
  searchEngines.items = searchEngines.items.filter((item) => item.id !== id);
  if (searchEngines.defaultId === id) {
    searchEngines.defaultId = searchEngines.items.find((item) => item.enabled)?.id || searchEngines.items[0].id;
  }
}

function setEngineEnabled(id: string, enabled: boolean) {
  const engine = searchEngines.items.find((item) => item.id === id);
  if (!engine) return;
  engine.enabled = enabled;
  if (!enabled && searchEngines.defaultId === id) {
    searchEngines.defaultId = searchEngines.items.find((item) => item.enabled)?.id || id;
  }
}

function setDefaultSearchEngine(id: string) {
  const engine = searchEngines.items.find((item) => item.id === id);
  if (!engine) return;
  engine.enabled = true;
  searchEngines.defaultId = id;
}
</script>

<template>
  <AdminLayout title="站点配置">
    <form class="site-config-form" @submit.prevent="save">
      <div v-if="message || error" class="site-config-feedback" aria-live="polite">
        <p v-if="message" class="notice">{{ message }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <section class="admin-card site-basics">
        <header class="admin-card-head">
          <div>
            <h2><Palette :size="18" /> 基础信息</h2>
            <p>站点内容、发布路径与背景风格</p>
          </div>
        </header>
        <div class="config-fields">
          <div class="field"><label>站点名</label><input v-model="form.name" /></div>
          <div class="field"><label>发布地址</label><input v-model="form.slug" /></div>
          <div class="field wide"><label>简介</label><textarea v-model="form.description" /></div>
          <div class="field wide"><label>背景图片 URL</label><input v-model="form.backgroundImage" /></div>
          <div class="field color-field">
            <label>背景色</label>
            <div class="color-control"><input v-model="form.backgroundColor" type="color" /><code>{{ form.backgroundColor }}</code></div>
          </div>
          <div class="field color-field">
            <label>字体色</label>
            <div class="color-control"><input v-model="form.fontColor" type="color" /><code>{{ form.fontColor }}</code></div>
          </div>
          <div class="field wide"><label>旧版默认搜索模板</label><input v-model="form.searchUrlTemplate" /></div>
          <label class="switch-row wide">
            <input v-model="form.localSearchFirst" type="checkbox" />
            <span><strong>站内优先搜索</strong><small>有本地结果时停留在导航页</small></span>
          </label>
        </div>
      </section>

      <section class="admin-card search-engine-editor">
        <header class="admin-card-head">
          <div>
            <h2><Search :size="18" /> 搜索引擎</h2>
            <p>自定义公开导航页可选的搜索入口，并指定默认项</p>
          </div>
          <button class="button secondary" data-testid="add-search-engine" type="button" @click="addSearchEngine">
            <Plus :size="16" /> 新增引擎
          </button>
        </header>

        <div class="search-engine-list">
          <article
            v-for="engine in searchEngines.items"
            :key="engine.id"
            class="search-engine-row"
            :data-testid="`search-engine-row-${engine.id}`"
          >
            <div class="field engine-name-field">
              <label>名称</label>
              <input v-model="engine.label" data-testid="search-engine-label" maxlength="60" />
            </div>
            <div class="field engine-short-field">
              <label>简称</label>
              <input v-model="engine.short" data-testid="search-engine-short" maxlength="4" />
            </div>
            <div class="field engine-template-field">
              <label>搜索 URL，必须包含 {query}</label>
              <input v-model="engine.template" data-testid="search-engine-template" type="url" />
            </div>
            <label class="engine-toggle">
              <input
                :checked="engine.enabled"
                data-testid="search-engine-enabled"
                type="checkbox"
                @change="setEngineEnabled(engine.id, ($event.target as HTMLInputElement).checked)"
              />
              <span>启用</span>
            </label>
            <label
              class="engine-default"
              :checked="searchEngines.defaultId === engine.id"
              :data-testid="`default-search-engine-${engine.id}`"
            >
              <input
                :checked="searchEngines.defaultId === engine.id"
                data-testid="search-engine-default"
                name="default-search-engine"
                type="radio"
                @change="setDefaultSearchEngine(engine.id)"
              />
              <span>默认</span>
            </label>
            <button
              class="icon-button danger"
              type="button"
              title="删除搜索引擎"
              :disabled="searchEngines.items.length <= 1"
              @click="removeSearchEngine(engine.id)"
            >
              <Trash2 :size="16" />
            </button>
          </article>
        </div>
      </section>

      <section class="admin-card portal-editor">
        <header class="admin-card-head">
          <div>
            <h2><Link2 :size="18" /> 博客联动</h2>
            <p>配置公开导航页中心图片、标题和右上角的博客入口</p>
          </div>
          <label class="portal-enabled">
            <input v-model="portal.enabled" type="checkbox" />
            <span>启用入口</span>
          </label>
        </header>

        <div class="portal-layout">
          <div class="config-fields">
            <div class="field">
              <label>入口名称</label>
              <input v-model="portal.label" data-testid="portal-label" placeholder="前往博客" />
            </div>
            <div class="field">
              <label>博客地址</label>
              <input v-model="portal.url" data-testid="portal-url" type="url" placeholder="https://blog.example.com" />
            </div>
            <div class="field wide">
              <label>自定义图片 URL</label>
              <input v-model="portal.imageUrl" data-testid="portal-image-url" type="url" placeholder="https://cdn.example.com/avatar.png" />
            </div>
            <label class="switch-row wide">
              <input v-model="portal.openInNewTab" type="checkbox" />
              <span><strong>新窗口打开</strong><small>关闭时会在当前页面直接切换到博客</small></span>
            </label>
          </div>

          <div class="portal-preview" :class="{ disabled: !portal.enabled }">
            <span class="portal-preview-kicker"><ArrowUpRight :size="14" /> {{ portal.label || '前往博客' }}</span>
            <div class="portal-preview-avatar">
              <img v-if="portal.imageUrl" :src="portal.imageUrl" alt="" />
              <Image v-else :size="28" />
            </div>
            <strong>{{ form.name || 'Nono' }}</strong>
            <small>{{ portal.url || '配置博客地址后即可双向跳转' }}</small>
          </div>
        </div>
      </section>

      <section class="admin-card theme-wall-card">
        <header class="admin-card-head">
          <div>
            <h2><Palette :size="18" /> 主题预设</h2>
            <p>一键应用整套配色与质感，应用后仍可在下方单独微调</p>
          </div>
        </header>
        <div class="theme-wall">
          <button
            v-for="preset in PUBLIC_THEMES"
            :key="preset.id"
            type="button"
            class="theme-card"
            :class="{ active: theme.id === preset.id }"
            :style="themePreviewStyle(preset)"
            :data-testid="`theme-${preset.id}`"
            @click="applyTheme(preset)"
          >
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

      <AppearanceEditor :appearance="appearance" :preview-bg="form.backgroundColor" />

      <footer class="site-config-actions">
        <span>设置保存后立即应用到公开导航页</span>
        <button class="button" type="submit" :disabled="saving"><Save :size="17" /> {{ saving ? '保存中...' : '保存设置' }}</button>
      </footer>
    </form>
  </AdminLayout>
</template>

<style scoped>
.site-config-form {
  display: grid;
  gap: 20px;
}

.site-config-feedback {
  display: grid;
  gap: 8px;
}

.site-config-feedback p {
  margin: 0;
}

.theme-wall {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
}

.theme-card {
  background: var(--theme-bg, #0b0d12);
  border: 2px solid transparent;
  border-radius: 12px;
  color: var(--theme-font, #f3f4f6);
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 8px;
  justify-items: start;
  padding: 14px;
  text-align: left;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.theme-card:hover,
.theme-card:focus-visible {
  outline: none;
  transform: translateY(-2px);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.18);
}

.theme-card.active {
  border-color: var(--accent, #10b981);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 16, 185, 129), 0.2);
}

.theme-card strong {
  font-size: 14px;
  font-weight: 800;
}

.theme-card small {
  font-size: 11px;
  opacity: 0.72;
}

.theme-swatch {
  align-items: center;
  display: flex;
  gap: 6px;
  margin-bottom: 2px;
}

.theme-swatch-tab {
  background: color-mix(in srgb, var(--theme-search, #f7f8fb) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-font, #fff) 18%, transparent);
  border-radius: 999px;
  display: inline-block;
  height: 10px;
  width: 44px;
}

.theme-swatch-card {
  background: color-mix(in srgb, var(--theme-card, #f7f8fb) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-font, #fff) 24%, transparent);
  border-radius: 4px;
  display: inline-block;
  height: 18px;
  width: 26px;
}

.theme-swatch-accent {
  background: var(--accent, #10b981);
  border-radius: 999px;
  display: inline-block;
  height: 14px;
  width: 14px;
}

.admin-card {
  margin: 0;
}

.admin-card-head h2 {
  align-items: center;
  display: flex;
  gap: 8px;
}

.config-fields {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.search-engine-list {
  display: grid;
  gap: 10px;
}

.search-engine-row {
  align-items: end;
  background: rgba(248, 250, 252, 0.7);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(120px, 0.7fr) 72px minmax(260px, 1.6fr) auto auto 36px;
  padding: 12px;
}

.search-engine-row .field {
  gap: 5px;
}

.engine-toggle,
.engine-default {
  align-items: center;
  color: #475569;
  display: inline-flex;
  font-size: 12px;
  font-weight: 750;
  gap: 6px;
  min-height: 40px;
}

.engine-toggle input,
.engine-default input {
  accent-color: var(--nono-accent);
  height: 17px;
  width: 17px;
}

.wide {
  grid-column: 1 / -1;
}

.color-control {
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  gap: 10px;
  min-height: 40px;
  padding: 5px 10px 5px 6px;
}

.color-control input {
  border: 0;
  height: 28px;
  min-height: 28px;
  padding: 0;
  width: 36px;
}

.color-control code {
  color: #475569;
  font-size: 12px;
}

.switch-row {
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  gap: 12px;
  min-height: 56px;
  padding: 10px 14px;
}

.switch-row input {
  accent-color: var(--nono-accent);
  height: 18px;
  width: 18px;
}

.switch-row span {
  display: grid;
  gap: 2px;
}

.switch-row strong {
  color: #0f172a;
  font-size: 13px;
}

.switch-row small {
  color: #64748b;
  font-size: 12px;
}

.portal-layout {
  align-items: stretch;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
}

.portal-enabled {
  align-items: center;
  color: #475569;
  display: inline-flex;
  font-size: 12px;
  font-weight: 750;
  gap: 8px;
}

.portal-enabled input {
  accent-color: var(--nono-accent);
  height: 17px;
  width: 17px;
}

.portal-preview {
  align-content: center;
  background:
    linear-gradient(145deg, rgba(15, 118, 110, 0.18), rgba(54, 95, 143, 0.13)),
    rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 8px;
  display: grid;
  gap: 9px;
  justify-items: center;
  min-height: 250px;
  overflow: hidden;
  padding: 24px;
  text-align: center;
  transition: opacity 0.2s ease;
}

.portal-preview.disabled {
  opacity: 0.48;
}

.portal-preview-kicker {
  align-items: center;
  color: var(--nono-accent);
  display: inline-flex;
  font-size: 12px;
  font-weight: 800;
  gap: 5px;
}

.portal-preview-avatar {
  align-items: center;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  color: #64748b;
  display: inline-flex;
  height: 82px;
  justify-content: center;
  overflow: hidden;
  width: 82px;
}

.portal-preview-avatar img {
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.portal-preview strong {
  color: #0f172a;
  font-size: 20px;
}

.portal-preview small {
  color: #64748b;
  font-size: 11px;
  max-width: 240px;
  overflow-wrap: anywhere;
}

.site-config-actions {
  align-items: center;
  background: #ffffff;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  bottom: 16px;
  display: flex;
  justify-content: space-between;
  min-height: 64px;
  padding: 12px 16px;
  position: sticky;
  z-index: 5;
}

.site-config-actions span {
  color: #64748b;
  font-size: 12px;
}

@media (max-width: 860px) {
  .portal-layout {
    grid-template-columns: 1fr;
  }

  .search-engine-row {
    grid-template-columns: minmax(0, 1fr) 72px auto auto 36px;
  }

  .engine-template-field {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

@media (max-width: 640px) {
  .config-fields {
    grid-template-columns: 1fr;
  }

  .wide {
    grid-column: auto;
  }

  .search-engine-row {
    align-items: stretch;
    grid-template-columns: minmax(0, 1fr) 64px 36px;
  }

  .engine-template-field {
    grid-column: 1 / -1;
  }

  .admin-card-head,
  .site-config-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .site-config-actions {
    gap: 10px;
    position: static;
  }
}
</style>
