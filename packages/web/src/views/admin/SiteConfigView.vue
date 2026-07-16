<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ArrowUpRight, Image, Link2, Palette, Save } from 'lucide-vue-next';
import AppearanceEditor from '@/components/admin/AppearanceEditor.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';
import { appearanceDefaults, getAppearanceSettings, type AppearanceSettings } from '@/utils/appearance';
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
</script>

<template>
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

      <AppearanceEditor :appearance="appearance" :preview-bg="form.backgroundColor" />

      <footer class="site-config-actions">
        <span>设置保存后立即应用到公开导航页</span>
        <button class="button" type="submit" :disabled="saving"><Save :size="17" /> {{ saving ? '保存中...' : '保存设置' }}</button>
      </footer>
  </form>
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

  .site-config-actions {
    gap: 10px;
    position: static;
  }
}
</style>
