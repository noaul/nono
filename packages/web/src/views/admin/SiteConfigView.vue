<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Gauge, LayoutGrid, Palette, Save, Search, SlidersHorizontal } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';
import { appearanceDefaults, getAppearanceSettings, toAppearanceCssVars, type AppearanceSettings } from '@/utils/appearance';

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
const message = ref('');
const error = ref('');
const saving = ref(false);
const previewStyle = computed(() => ({
  ...toAppearanceCssVars(appearance),
  '--preview-bg': form.backgroundColor || '#090a0f',
}));

onMounted(async () => {
  const site = await apiRequest<Site>('/api/admin/site');
  Object.assign(form, site, { settings: { ...(site.settings || {}) } });
  Object.assign(appearance, getAppearanceSettings(site.settings));
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

function applyPreset(preset: 'performance' | 'balanced' | 'clear') {
  const values: Record<typeof preset, AppearanceSettings> = {
    performance: { cardRadius: 6, cardOpacity: 72, cardBlur: 0, searchRadius: 24, searchOpacity: 62, searchBlur: 0 },
    balanced: { ...appearanceDefaults },
    clear: { cardRadius: 12, cardOpacity: 42, cardBlur: 16, searchRadius: 30, searchOpacity: 24, searchBlur: 20 },
  };
  Object.assign(appearance, values[preset]);
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
          <div class="field wide"><label>搜索模板</label><input v-model="form.searchUrlTemplate" /></div>
          <label class="switch-row wide">
            <input v-model="form.localSearchFirst" type="checkbox" />
            <span><strong>站内优先搜索</strong><small>有本地结果时停留在导航页</small></span>
          </label>
        </div>
      </section>

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
          </div>
        </header>

        <div class="appearance-layout">
          <div class="appearance-controls">
            <fieldset>
              <legend><LayoutGrid :size="16" /> 文件夹卡片</legend>
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
          </div>

          <div data-testid="appearance-preview" class="appearance-preview" :style="previewStyle">
            <div class="preview-search"><Search :size="15" /><span>搜索书签...</span></div>
            <div class="preview-folder">
              <strong>常用工具</strong>
              <div class="preview-links"><span>GitHub</span><span>设计资源</span><span>开发文档</span><span>灵感收藏</span></div>
            </div>
          </div>
        </div>
      </section>

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
  accent-color: #0f766e;
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
  color: #0f766e;
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
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
}

legend {
  align-items: center;
  color: #0f172a;
  display: flex;
  font-size: 13px;
  font-weight: 750;
  gap: 7px;
  margin-bottom: 10px;
}

.range-field {
  display: grid;
  gap: 7px;
}

.range-field span {
  color: #475569;
  display: flex;
  font-size: 12px;
  justify-content: space-between;
}

.range-field output {
  color: #0f766e;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.range-field input {
  accent-color: #0f766e;
  cursor: pointer;
  width: 100%;
}

.appearance-preview {
  align-content: center;
  background:
    linear-gradient(140deg, rgba(15, 118, 110, 0.28), rgba(15, 23, 42, 0.2)),
    var(--preview-bg);
  border-radius: 8px;
  color: #ffffff;
  display: grid;
  gap: 18px;
  min-height: 330px;
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

.preview-search,
.preview-folder {
  position: relative;
}

.preview-search {
  align-items: center;
  backdrop-filter: blur(var(--public-search-blur));
  background: rgba(10, 14, 18, var(--public-search-opacity));
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--public-search-radius);
  display: flex;
  font-size: 12px;
  gap: 8px;
  min-height: 42px;
  padding: 0 14px;
}

.preview-folder {
  backdrop-filter: blur(var(--public-card-blur));
  background: rgba(10, 14, 18, var(--public-card-opacity));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--public-card-radius);
  display: grid;
  gap: 14px;
  padding: 18px;
}

.preview-folder strong {
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
  font-size: 11px;
  overflow: hidden;
  padding: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  .appearance-layout {
    grid-template-columns: 1fr;
  }

  .appearance-preview {
    min-height: 280px;
  }
}

@media (max-width: 640px) {
  .config-fields {
    grid-template-columns: 1fr;
  }

  .wide {
    grid-column: auto;
  }

  .admin-card-head,
  .site-config-actions {
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
    min-height: 250px;
    padding: 18px;
  }

  .site-config-actions {
    gap: 10px;
    position: static;
  }
}
</style>
