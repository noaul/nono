<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue';
import type { MessageKey } from '@/locales';
import {
  Activity,
  ArrowRight,
  Bot,
  Bell,
  BookOpen,
  CircleDollarSign,
  ExternalLink,
  Folder as FolderIcon,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  Lock,
  Plus,
  Settings,
  Upload,
} from 'lucide-vue-next';
import { apiRequest } from '@/api/client';
import type { Folder, Link } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);

const notabCount = computed(() => folders.value.filter((folder) => !folder.parentId).length);
const contentFolders = computed(() => folders.value.filter((folder) => folder.parentId));
const lockedCount = computed(() => contentFolders.value.filter((folder) => folder.locked).length);
const averageLinksPerFolder = computed(() => (
  contentFolders.value.length ? Math.round((links.value.length / contentFolders.value.length) * 10) / 10 : 0
));

type Shortcut = { labelKey: MessageKey; detailKey: MessageKey; to: string; icon: Component };

const primaryShortcuts: Shortcut[] = [
  { labelKey: 'dashboard.aNewBookmark', detailKey: 'dashboard.aNewBookmarkHint', to: '/admin/links#new-bookmark', icon: Plus },
  { labelKey: 'dashboard.aImport', detailKey: 'dashboard.aImportHint', to: '/admin/automation', icon: Upload },
  { labelKey: 'dashboard.aNotabs', detailKey: 'dashboard.aNotabsHint', to: '/admin/notabs', icon: Layers },
  { labelKey: 'dashboard.aFolders', detailKey: 'dashboard.aFoldersHint', to: '/admin/links#folder-management', icon: FolderIcon },
];

const toolShortcuts: Shortcut[] = [
  { labelKey: 'dashboard.aDuplicates', detailKey: 'dashboard.aDuplicatesHint', to: '/admin/links#bookmark-tools', icon: ListChecks },
  { labelKey: 'dashboard.aHealth', detailKey: 'dashboard.aHealthHint', to: '/admin/links#bookmark-tools', icon: Activity },
  { labelKey: 'dashboard.aLlm', detailKey: 'dashboard.aLlmHint', to: '/admin/llm', icon: Bot },
  { labelKey: 'dashboard.aTokens', detailKey: 'dashboard.aTokensHint', to: '/admin/tokens', icon: KeyRound },
  { labelKey: 'dashboard.aNotifications', detailKey: 'dashboard.aNotificationsHint', to: '/admin/notifications', icon: Bell },
];

const appShortcuts: Shortcut[] = [
  { labelKey: 'dashboard.aNodesk', detailKey: 'dashboard.aNodeskHint', to: '/nodesk', icon: BookOpen },
  { labelKey: 'dashboard.aNoMoney', detailKey: 'dashboard.aNoMoneyHint', to: '/nomoney', icon: CircleDollarSign },
];

onMounted(async () => {
  [folders.value, links.value] = await Promise.all([
    apiRequest<Folder[]>('/api/admin/folders'),
    apiRequest<Link[]>('/api/admin/links'),
  ]);
});
</script>

<template>
  <div class="admin-page-stack dashboard-workbench">
    <header class="dashboard-overview-header">
      <h2>{{ t('dashboard.contentOverview') }}</h2>
      <div class="dashboard-header-actions">
        <a class="button secondary" href="/" target="_blank" rel="noreferrer"><ExternalLink :size="17" /> {{ t('dashboard.openHome') }}</a>
        <RouterLink class="button" to="/admin/site"><Settings :size="17" /> {{ t('dashboard.siteSettings') }}</RouterLink>
      </div>
    </header>

    <div class="ops-metric-grid" :aria-label="t('dashboard.contentOverview')">
      <RouterLink :aria-label="t('dashboard.notabCount', { count: notabCount })" to="/admin/notabs" class="ops-metric-card metric-tone-green">
        <span class="ops-metric-icon"><Layers :size="18" /></span>
        <span class="ops-metric-copy">
          <span>NoTab</span>
          <small>{{ t('dashboard.notabScope') }}</small>
        </span>
        <strong>{{ notabCount }}</strong>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink :aria-label="t('dashboard.folderCount', { count: contentFolders.length })" to="/admin/links#folder-management" class="ops-metric-card metric-tone-blue">
        <span class="ops-metric-icon"><FolderIcon :size="20" /></span>
        <span class="ops-metric-copy">
          <span>{{ t('dashboard.folders') }}</span>
          <small>{{ t('dashboard.folderScope') }}</small>
        </span>
        <strong>{{ contentFolders.length }}</strong>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink :aria-label="t('dashboard.bookmarkCount', { count: links.length, average: averageLinksPerFolder })" to="/admin/links" class="ops-metric-card metric-tone-amber">
        <span class="ops-metric-icon"><Link2 :size="18" /></span>
        <span class="ops-metric-copy">
          <span>{{ t('dashboard.bookmarks') }}</span>
          <small>{{ t('dashboard.bookmarkAverage', { average: averageLinksPerFolder }) }}</small>
        </span>
        <strong>{{ links.length }}</strong>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink :aria-label="t('dashboard.lockedCount', { count: lockedCount })" to="/admin/links#folder-management" class="ops-metric-card metric-tone-rose">
        <span class="ops-metric-icon"><Lock :size="18" /></span>
        <span class="ops-metric-copy">
          <span>{{ t('dashboard.lockedFolders') }}</span>
          <small>{{ t('dashboard.lockedScope') }}</small>
        </span>
        <strong>{{ lockedCount }}</strong>
        <ArrowRight :size="16" />
      </RouterLink>
    </div>

    <div class="dashboard-action-layout">
      <section class="dashboard-primary-section">
        <header class="dashboard-section-head">
          <h2>{{ t('dashboard.quickActions') }}</h2>
        </header>
        <div class="dashboard-primary-grid">
          <RouterLink v-for="shortcut in primaryShortcuts" :key="shortcut.to" class="dashboard-primary-action" :to="shortcut.to">
            <span class="dashboard-primary-icon"><component :is="shortcut.icon" :size="19" /></span>
            <span class="dashboard-action-copy">
              <strong>{{ t(shortcut.labelKey) }}</strong>
              <small>{{ t(shortcut.detailKey) }}</small>
            </span>
            <ArrowRight :size="15" />
          </RouterLink>
        </div>
      </section>

      <aside class="dashboard-tools-column">
        <section class="dashboard-tool-section">
          <header class="dashboard-section-head">
            <h2>{{ t('dashboard.managementTools') }}</h2>
          </header>
          <div class="dashboard-tool-list">
            <RouterLink v-for="shortcut in toolShortcuts" :key="shortcut.to + shortcut.labelKey" class="dashboard-tool-link" :to="shortcut.to">
              <span class="dashboard-tool-icon"><component :is="shortcut.icon" :size="17" /></span>
              <span class="dashboard-action-copy">
                <strong>{{ t(shortcut.labelKey) }}</strong>
                <small>{{ t(shortcut.detailKey) }}</small>
              </span>
              <ArrowRight :size="15" />
            </RouterLink>
          </div>
        </section>

        <section class="dashboard-tool-section">
          <header class="dashboard-section-head">
            <h2>{{ t('dashboard.connectedApps') }}</h2>
          </header>
          <div class="dashboard-tool-list">
            <a v-for="shortcut in appShortcuts" :key="shortcut.to" class="dashboard-tool-link" :href="shortcut.to">
              <span class="dashboard-tool-icon"><component :is="shortcut.icon" :size="17" /></span>
              <span class="dashboard-action-copy">
                <strong>{{ t(shortcut.labelKey) }}</strong>
                <small>{{ t(shortcut.detailKey) }}</small>
              </span>
              <ExternalLink :size="15" />
            </a>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ops-metric-card strong,
.dashboard-primary-action strong,
.dashboard-tool-link strong,
.dashboard-section-head h2 {
  letter-spacing: 0;
}

.dashboard-primary-action,
.dashboard-tool-link,
.dashboard-action-copy {
  min-width: 0;
}

.dashboard-action-copy strong,
.dashboard-action-copy small {
  overflow-wrap: anywhere;
}
</style>
