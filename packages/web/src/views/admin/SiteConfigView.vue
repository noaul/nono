<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ArrowUpRight, Image, Link2, Palette, Plus, Save, Search, Trash2 } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';
import { getPortalSettings, portalDefaults } from '@/utils/portal';
import { getSearchEngineSettings, type SearchEngineSettings } from '@/utils/searchEngines';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

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
const portal = reactive({ ...portalDefaults });
const searchEngines = reactive<SearchEngineSettings>({ defaultId: 'default', items: [] });
const message = ref('');
const error = ref('');
const saving = ref(false);

onMounted(async () => {
  const site = await apiRequest<Site>('/api/admin/site');
  Object.assign(form, site, { settings: { ...(site.settings || {}) } });
  Object.assign(portal, getPortalSettings(site.settings, import.meta.env.VITE_BLOG_URL));
  const savedSearchEngines = getSearchEngineSettings(site.settings, site.searchUrlTemplate);
  searchEngines.defaultId = savedSearchEngines.defaultId;
  searchEngines.items = savedSearchEngines.items.map((item) => ({
    ...item,
    template: item.template || site.searchUrlTemplate,
  }));
});

async function save() {
  error.value = '';
  message.value = '';
  saving.value = true;
  try {
    const payload = {
      name: form.name,
      description: form.description,
      slug: form.slug,
      backgroundImage: form.backgroundImage,
      backgroundColor: form.backgroundColor,
      fontColor: form.fontColor,
      searchUrlTemplate: form.searchUrlTemplate,
      localSearchFirst: form.localSearchFirst,
      settings: {
        ...form.settings,
        portal: { ...portal },
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
    message.value = t('site.saved');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('common.saveFailed');
  } finally {
    saving.value = false;
  }
}

function addSearchEngine() {
  const id = `custom-${Date.now()}-${searchEngines.items.length + 1}`;
  searchEngines.items.push({
    id,
    label: t('site.customSearch'),
    short: '#',
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
  <div class="admin-page-stack">
    <AdminPageHeader :eyebrow="t('admin.sectionOperations')" :title="t('admin.titleSite')">
      <template #actions>
        <button class="button" form="site-config-form" type="submit" :disabled="saving"><Save :size="17" /> {{ saving ? t('common.saving') : t('site.saveSettings') }}</button>
      </template>
    </AdminPageHeader>
    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <form id="site-config-form" class="site-config-form" @submit.prevent="save">

      <section class="admin-card site-basics">
        <header class="admin-card-head">
          <h2><Palette :size="18" /> {{ t('site.basics') }}</h2>
        </header>
        <div class="config-fields">
          <div class="field"><label>{{ t('site.name') }}</label><input v-model="form.name" /></div>
          <div class="field"><label>{{ t('site.slug') }}</label><input v-model="form.slug" /></div>
          <div class="field wide"><label>{{ t('site.description') }}</label><textarea v-model="form.description" /></div>
          <div class="field wide"><label>{{ t('site.backgroundImage') }}</label><input v-model="form.backgroundImage" /></div>
          <div class="field color-field">
            <label>{{ t('appearance.backgroundColor') }}</label>
            <div class="color-control"><input v-model="form.backgroundColor" type="color" /><code>{{ form.backgroundColor }}</code></div>
          </div>
          <div class="field wide"><label>{{ t('site.legacyTemplate') }}</label><input v-model="form.searchUrlTemplate" /></div>
          <label class="switch-row wide">
            <input v-model="form.localSearchFirst" type="checkbox" />
            <span><strong>{{ t('site.localFirst') }}</strong><small>{{ t('site.localFirstHint') }}</small></span>
          </label>
        </div>
      </section>

      <section class="admin-card search-engine-editor">
        <header class="admin-card-head">
          <h2><Search :size="18" /> {{ t('site.searchEngines') }}</h2>
          <button class="button secondary" data-testid="add-search-engine" type="button" @click="addSearchEngine">
            <Plus :size="16" /> {{ t('site.addEngine') }}
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
              <label>{{ t('tokens.name') }}</label>
              <input v-model="engine.label" data-testid="search-engine-label" maxlength="60" />
            </div>
            <div class="field engine-short-field">
              <label>{{ t('site.engineShort') }}</label>
              <input v-model="engine.short" data-testid="search-engine-short" maxlength="4" />
            </div>
            <div class="field engine-template-field">
              <label>{{ t('site.engineTemplate') }}</label>
              <input v-model="engine.template" data-testid="search-engine-template" type="url" />
            </div>
            <label class="engine-toggle">
              <input
                :checked="engine.enabled"
                data-testid="search-engine-enabled"
                type="checkbox"
                @change="setEngineEnabled(engine.id, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t('site.enabled') }}</span>
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
              <span>{{ t('site.default') }}</span>
            </label>
            <button
              class="icon-button danger"
              type="button"
              :title="t('site.deleteEngine')"
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
          <h2><Link2 :size="18" /> {{ t('site.portal') }}</h2>
          <label class="portal-enabled">
            <input v-model="portal.enabled" type="checkbox" />
            <span>{{ t('site.portalEnabled') }}</span>
          </label>
        </header>

        <div class="portal-layout">
          <div class="config-fields">
            <div class="field">
              <label>{{ t('site.portalLabel') }}</label>
              <input v-model="portal.label" data-testid="portal-label" :placeholder="t('site.portalLabelPlaceholder')" />
            </div>
            <div class="field">
              <label>{{ t('site.portalUrl') }}</label>
              <input v-model="portal.url" data-testid="portal-url" type="url" placeholder="https://blog.example.com" />
            </div>
            <div class="field wide">
              <label>{{ t('site.portalImage') }}</label>
              <input v-model="portal.imageUrl" data-testid="portal-image-url" type="url" placeholder="https://cdn.example.com/avatar.png" />
            </div>
            <label class="switch-row wide">
              <input v-model="portal.openInNewTab" type="checkbox" />
              <span><strong>{{ t('site.portalNewTab') }}</strong><small>{{ t('site.portalNewTabHint') }}</small></span>
            </label>
          </div>

          <div class="portal-preview" :class="{ disabled: !portal.enabled }">
            <span class="portal-preview-kicker"><ArrowUpRight :size="14" /> {{ portal.label || t('site.portalLabelPlaceholder') }}</span>
            <div class="portal-preview-avatar">
              <img v-if="portal.imageUrl" :src="portal.imageUrl" alt="" />
              <Image v-else :size="28" />
            </div>
            <strong>{{ form.name || 'Nono' }}</strong>
            <small>{{ portal.url || t('site.portalUrlHint') }}</small>
          </div>
        </div>
      </section>

    </form>
  </div>
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
