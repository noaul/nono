<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ExternalLink, FolderOpen } from '@lucide/vue';
import FaviconBadge from '@/components/FaviconBadge.vue';
import { apiRequest } from '@/api/client';
import type { SharedFolderPayload } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();
const route = useRoute();
const payload = ref<SharedFolderPayload | null>(null);
const failed = ref(false);
let robotsMeta: HTMLMetaElement | null = null;

// Sub-folders keep the tree order the server sends; each section lists its own links.
const sections = computed(() => {
  if (!payload.value) return [];
  const byId = new Map(payload.value.folders.map((folder) => [folder.id, folder]));
  const depth = (id: number) => {
    let level = 0;
    for (let folder = byId.get(id); folder?.parentId && byId.has(folder.parentId) && level < 20; folder = byId.get(folder.parentId)) level += 1;
    return level;
  };
  return payload.value.folders
    .map((folder) => ({ folder, depth: depth(folder.id), links: payload.value!.links.filter((link) => link.folderId === folder.id) }))
    .filter((section) => section.links.length || section.depth === 0);
});

onMounted(async () => {
  // Shared pages are unlisted: keep them out of search engines.
  robotsMeta = document.createElement('meta');
  robotsMeta.name = 'robots';
  robotsMeta.content = 'noindex, nofollow';
  document.head.appendChild(robotsMeta);
  try {
    payload.value = await apiRequest<SharedFolderPayload>(`/api/share/${encodeURIComponent(String(route.params.token || ''))}`);
    document.title = `${payload.value.folder.name} · NoNo`;
  } catch {
    failed.value = true;
  }
});

onBeforeUnmount(() => robotsMeta?.remove());
</script>

<template>
  <main class="shared-folder-page">
    <section v-if="failed" class="shared-folder-card shared-folder-missing" data-testid="share-missing">
      <h1>{{ t('shares.missingTitle') }}</h1>
      <p>{{ t('shares.missingBody') }}</p>
    </section>
    <section v-else-if="payload" class="shared-folder-card">
      <header class="shared-folder-head">
        <span class="shared-folder-icon"><FolderOpen :size="22" /></span>
        <div>
          <h1 data-testid="share-title">{{ payload.folder.name }}</h1>
          <p v-if="payload.folder.description">{{ payload.folder.description }}</p>
          <small>{{ t('shares.readOnly', { count: payload.links.length }) }}</small>
        </div>
      </header>
      <section v-for="section in sections" :key="section.folder.id" class="shared-folder-section" :style="{ '--depth': section.depth }">
        <h2 v-if="section.depth > 0">{{ section.folder.name }}</h2>
        <p v-if="!payload.links.length" class="shared-folder-empty">{{ t('shares.noLinks') }}</p>
        <ul>
          <li v-for="link in section.links" :key="link.id">
            <a :href="link.url" target="_blank" rel="noreferrer noopener" :data-testid="`share-link-${link.id}`">
              <FaviconBadge :name="link.name" :url="link.url" :size="20" />
              <span class="shared-link-text">
                <strong>{{ link.name || link.url }}</strong>
                <small>{{ link.description || link.url }}</small>
              </span>
              <ExternalLink :size="14" class="shared-link-arrow" />
            </a>
          </li>
        </ul>
      </section>
    </section>
    <p v-else class="shared-folder-loading">{{ t('common.loading') }}</p>
  </main>
</template>

<style scoped>
.shared-folder-page {
  background: var(--ui-bg, #f6f8fa);
  box-sizing: border-box;
  color: var(--ui-text);
  min-height: 100vh;
  padding: 32px 16px;
}

.shared-folder-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  box-sizing: border-box;
  margin: 0 auto;
  max-width: 760px;
  padding: 20px;
}

.shared-folder-head {
  align-items: flex-start;
  border-bottom: 1px solid var(--ui-border);
  display: flex;
  gap: 12px;
  padding-bottom: 14px;
}

.shared-folder-icon {
  align-items: center;
  background: color-mix(in srgb, var(--ui-accent) 12%, transparent);
  border-radius: 10px;
  color: var(--ui-accent);
  display: inline-flex;
  flex: 0 0 auto;
  height: 40px;
  justify-content: center;
  width: 40px;
}

.shared-folder-head h1 {
  font-size: 20px;
  margin: 0;
}

.shared-folder-head p {
  color: var(--ui-text-muted);
  font-size: 14px;
  margin: 4px 0 0;
}

.shared-folder-head small,
.shared-folder-empty,
.shared-folder-loading {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.shared-folder-section {
  margin-left: calc(min(var(--depth), 3) * 14px);
  padding-top: 12px;
}

.shared-folder-section h2 {
  color: var(--ui-text-muted);
  font-size: 13px;
  margin: 4px 0 6px;
}

.shared-folder-section ul {
  display: grid;
  gap: 2px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.shared-folder-section a {
  align-items: center;
  border-radius: var(--ui-radius-sm);
  color: inherit;
  display: grid;
  gap: 10px;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  padding: 8px;
  text-decoration: none;
}

.shared-folder-section a:hover,
.shared-folder-section a:focus-visible {
  background: var(--ui-surface-sunken);
}

.shared-link-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.shared-link-text strong,
.shared-link-text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shared-link-text strong {
  font-size: 14px;
  font-weight: 600;
}

.shared-link-text small {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.shared-link-arrow {
  color: var(--ui-text-muted);
}

.shared-folder-missing h1 {
  font-size: 18px;
  margin: 0 0 6px;
}

.shared-folder-missing p {
  color: var(--ui-text-muted);
  margin: 0;
}

.shared-folder-loading {
  text-align: center;
}
</style>
