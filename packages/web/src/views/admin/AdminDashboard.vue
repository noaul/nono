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
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
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

type Shortcut = { labelKey: MessageKey; detailKey: MessageKey; to: string; icon: Component; external?: boolean };

const shortcuts: Shortcut[] = [
  { labelKey: 'dashboard.aNewBookmark', detailKey: 'dashboard.aNewBookmarkHint', to: '/admin/links#new-bookmark', icon: Plus },
  { labelKey: 'dashboard.aImport', detailKey: 'dashboard.aImportHint', to: '/admin/automation', icon: Upload },
  { labelKey: 'dashboard.aNotabs', detailKey: 'dashboard.aNotabsHint', to: '/admin/notabs', icon: Layers },
  { labelKey: 'dashboard.aFolders', detailKey: 'dashboard.aFoldersHint', to: '/admin/links#folder-management', icon: FolderIcon },
  { labelKey: 'dashboard.aDuplicates', detailKey: 'dashboard.aDuplicatesHint', to: '/admin/links#bookmark-tools', icon: ListChecks },
  { labelKey: 'dashboard.aHealth', detailKey: 'dashboard.aHealthHint', to: '/admin/links#bookmark-tools', icon: Activity },
  { labelKey: 'dashboard.aLlm', detailKey: 'dashboard.aLlmHint', to: '/admin/llm', icon: Bot },
  { labelKey: 'dashboard.aTokens', detailKey: 'dashboard.aTokensHint', to: '/admin/tokens', icon: KeyRound },
  { labelKey: 'dashboard.aNotifications', detailKey: 'dashboard.aNotificationsHint', to: '/admin/notifications', icon: Bell },
  { labelKey: 'dashboard.aNodesk', detailKey: 'dashboard.aNodeskHint', to: '/nodesk', icon: BookOpen, external: true },
  { labelKey: 'dashboard.aNoMoney', detailKey: 'dashboard.aNoMoneyHint', to: '/nomoney', icon: CircleDollarSign, external: true },
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
    <AdminPageHeader :eyebrow="t('admin.sectionOperations')" :title="t('admin.titleDashboard')">
      <template #actions>
        <a class="button secondary" href="/" target="_blank" rel="noreferrer"><ExternalLink :size="17" /> {{ t('dashboard.openHome') }}</a>
        <RouterLink class="button" to="/admin/site"><Settings :size="17" /> {{ t('dashboard.siteSettings') }}</RouterLink>
      </template>
    </AdminPageHeader>

    <div class="ops-metric-grid" :aria-label="t('dashboard.contentOverview')">
      <RouterLink to="/admin/notabs" class="ops-metric-card tone-green">
        <Layers :size="20" />
        <div>
          <span>Notab</span>
          <strong>{{ notabCount }}</strong>
          <small>{{ t('dashboard.notabCount', { count: notabCount }) }}</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/links#folder-management" class="ops-metric-card tone-blue">
        <FolderIcon :size="20" />
        <div>
          <span>{{ t('dashboard.folders') }}</span>
          <strong>{{ contentFolders.length }}</strong>
          <small>{{ t('dashboard.folderCount', { count: contentFolders.length }) }}</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/links" class="ops-metric-card tone-amber">
        <Link2 :size="20" />
        <div>
          <span>{{ t('dashboard.bookmarks') }}</span>
          <strong>{{ links.length }}</strong>
          <small>{{ t('dashboard.bookmarkCount', { count: links.length, average: averageLinksPerFolder }) }}</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/links#folder-management" class="ops-metric-card tone-rose">
        <Lock :size="20" />
        <div>
          <span>{{ t('dashboard.lockedFolders') }}</span>
          <strong>{{ lockedCount }}</strong>
          <small>{{ t('dashboard.lockedCount', { count: lockedCount }) }}</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>
    </div>

    <section class="dashboard-shortcuts-panel">
      <header class="dashboard-section-head">
        <h2>{{ t('dashboard.quickActions') }}</h2>
      </header>
      <div class="dashboard-shortcut-grid">
        <template v-for="shortcut in shortcuts" :key="shortcut.to">
          <a v-if="shortcut.external" class="dashboard-shortcut" :href="shortcut.to">
            <span class="dashboard-shortcut-icon"><component :is="shortcut.icon" :size="19" /></span>
            <span class="dashboard-shortcut-copy">
              <strong>{{ t(shortcut.labelKey) }}</strong>
              <small>{{ t(shortcut.detailKey) }}</small>
            </span>
            <ArrowRight :size="15" />
          </a>
          <RouterLink v-else class="dashboard-shortcut" :to="shortcut.to">
            <span class="dashboard-shortcut-icon"><component :is="shortcut.icon" :size="19" /></span>
            <span class="dashboard-shortcut-copy">
              <strong>{{ t(shortcut.labelKey) }}</strong>
              <small>{{ t(shortcut.detailKey) }}</small>
            </span>
            <ArrowRight :size="15" />
          </RouterLink>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ops-metric-card strong,
.dashboard-shortcut strong,
.dashboard-section-head h2 {
  letter-spacing: 0;
}

.dashboard-shortcut,
.dashboard-shortcut-copy {
  min-width: 0;
}

.dashboard-shortcut strong,
.dashboard-shortcut small {
  overflow-wrap: anywhere;
}
</style>
