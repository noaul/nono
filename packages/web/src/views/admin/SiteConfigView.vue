<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ArrowUpRight, Gauge, Image, LayoutGrid, Link2, Palette, RotateCcw, Save, Search, SlidersHorizontal } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';
import { appearanceDefaults, getAppearanceSettings, toAppearanceCssVars, type AppearanceSettings } from '@/utils/appearance';
import { getPortalSettings, portalDefaults } from '@/utils/portal';

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
  Object.assign(portal, getPortalSettings(site.settings, import.meta.env.VITE_BLOG_URL));
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
    performance: {
      cardRadius: 6, cardOpacity: 72, cardBlur: 0,
      searchRadius: 24, searchOpacity: 62, searchBlur: 0,
      modalRadius: 8, modalOpacity: 90, modalBlur: 0,
      tabRadius: 20, tabOpacity: 72, tabBlur: 0,
      adminRadius: 6, adminOpacity: 88, adminBlur: 4,
    },
    balanced: { ...appearanceDefaults },
    clear: {
      cardRadius: 12, cardOpacity: 68, cardBlur: 16,
      searchRadius: 30, searchOpacity: 60, searchBlur: 20,
      modalRadius: 16, modalOpacity: 88, modalBlur: 30,
      tabRadius: 24, tabOpacity: 64, tabBlur: 20,
      adminRadius: 12, adminOpacity: 84, adminBlur: 16,
    },
  };
  Object.assign(appearance, values[preset]);
}

function resetAppearance() {
  Object.assign(appearance, appearanceDefaults);
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
              <div class="preview-modal"><strong>解锁文件夹</strong><span>输入密码后继续访问</span></div>
            </div>
            <div class="preview-admin"><strong>后台表面</strong><span>运营数据与快捷操作</span></div>
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
  background: rgba(255, 255, 255, var(--public-tab-opacity));
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--public-tab-radius);
  display: flex;
  gap: 4px;
  grid-column: 1 / -1;
  padding: 5px;
}

.preview-tabs span {
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
  background: rgba(10, 14, 18, var(--public-search-opacity));
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--public-search-radius);
  display: flex;
  font-size: 12px;
  gap: 8px;
  grid-column: 1 / -1;
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
  display: grid;
  grid-column: 1 / -1;
  min-height: 130px;
  padding: 18px;
}

.preview-modal {
  backdrop-filter: blur(var(--public-modal-blur));
  background: rgba(17, 20, 28, var(--public-modal-opacity));
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--public-modal-radius);
  display: grid;
  gap: 7px;
  justify-self: center;
  max-width: 260px;
  padding: 18px;
  width: 100%;
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
  .appearance-layout,
  .portal-layout {
    grid-template-columns: 1fr;
  }

  .appearance-preview {
    min-height: 500px;
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
    grid-template-columns: 1fr;
    min-height: 620px;
    padding: 18px;
  }

  .preview-folder,
  .preview-admin {
    grid-column: 1 / -1;
  }

  .site-config-actions {
    gap: 10px;
    position: static;
  }
}
</style>
