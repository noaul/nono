<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue';
import type { MessageKey } from '@/locales';
import { Folder, Layers3, Link2, RotateCcw, Trash2 } from '@lucide/vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import ContentManagementTabs from '@/components/admin/ContentManagementTabs.vue';
import { apiRequest } from '@/api/client';
import type { TrashItem, TrashItemKind, TrashPage } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { useToasts } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';
import { formatShanghaiDateTime } from '@/utils/dateTime';

const { t } = useI18n();

type TrashFilter = 'all' | TrashItemKind;

const PAGE_SIZE = 50;
const items = ref<TrashItem[]>([]);
const total = ref(0);
const nextCursor = ref<string | null>(null);
const filter = ref<TrashFilter>('all');
const loading = ref(true);
const loadingMore = ref(false);
const workingIds = ref(new Set<string>());
const emptying = ref(false);
const error = ref('');
const confirmApi = useConfirm();
const toasts = useToasts();

const filters: Array<{ id: TrashFilter; labelKey: MessageKey }> = [
  { id: 'all', labelKey: 'trash.all' },
  { id: 'bookmark', labelKey: 'nav.kindBookmark' },
  { id: 'folder', labelKey: 'nav.kindFolder' },
  { id: 'notab', labelKey: 'nav.kindNotab' },
];
const kindMeta: Record<TrashItemKind, { labelKey: MessageKey; icon: Component }> = {
  bookmark: { labelKey: 'nav.kindBookmark', icon: Link2 },
  folder: { labelKey: 'nav.kindFolder', icon: Folder },
  notab: { labelKey: 'nav.kindNotab', icon: Layers3 },
};
const filteredItems = computed(() => filter.value === 'all' ? items.value : items.value.filter((item) => item.kind === filter.value));

function fetchPage(cursor: string | null) {
  return apiRequest<TrashPage>(`/api/admin/trash?limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const page = await fetchPage(null);
    items.value = page.items;
    total.value = page.total;
    nextCursor.value = page.nextCursor;
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('trash.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return;
  loadingMore.value = true;
  try {
    const page = await fetchPage(nextCursor.value);
    const seen = new Set(items.value.map((item) => item.id));
    items.value = [...items.value, ...page.items.filter((item) => !seen.has(item.id))];
    total.value = page.total;
    nextCursor.value = page.nextCursor;
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : t('trash.loadFailed'), 'error');
  } finally {
    loadingMore.value = false;
  }
}

function dropItem(id: string) {
  items.value = items.value.filter((entry) => entry.id !== id);
  total.value = Math.max(0, total.value - 1);
}

function setWorking(id: string, active: boolean) {
  const next = new Set(workingIds.value);
  if (active) next.add(id);
  else next.delete(id);
  workingIds.value = next;
}

async function restore(item: TrashItem) {
  if (workingIds.value.has(item.id)) return;
  if (!await confirmApi.confirm({ title: t('trash.restoreKind', { kind: t(kindMeta[item.kind].labelKey) }), message: t('trash.restoreMessage', { name: item.label }), confirmText: t('trash.restore') })) return;
  setWorking(item.id, true);
  try {
    await apiRequest(`/api/admin/trash/${item.id}/restore`, { method: 'POST' });
    dropItem(item.id);
    toasts.push(t('trash.restored', { kind: t(kindMeta[item.kind].labelKey) }), 'success');
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : t('trash.restoreFailed'), 'error');
  } finally {
    setWorking(item.id, false);
  }
}

async function removePermanently(item: TrashItem) {
  if (workingIds.value.has(item.id)) return;
  if (!await confirmApi.confirm({
    title: t('trash.deleteForever'),
    message: t('trash.deleteForeverMessage', { name: item.label }),
    confirmText: t('trash.deleteForever'),
    tone: 'danger',
  })) return;
  setWorking(item.id, true);
  try {
    await apiRequest(`/api/admin/trash/${item.id}`, { method: 'DELETE' });
    dropItem(item.id);
    toasts.push(t('trash.deletedForever'), 'success');
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : t('nav.deleteFailed'), 'error');
  } finally {
    setWorking(item.id, false);
  }
}

async function emptyTrash() {
  if (!total.value || emptying.value) return;
  if (!await confirmApi.confirm({
    title: t('trash.emptyTrash'),
    message: t('trash.emptyMessage', { count: total.value }),
    confirmText: t('trash.empty'),
    tone: 'danger',
  })) return;
  emptying.value = true;
  try {
    await apiRequest('/api/admin/trash', { method: 'DELETE' });
    items.value = [];
    total.value = 0;
    nextCursor.value = null;
    toasts.push(t('trash.emptied'), 'success');
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : t('trash.emptyFailed'), 'error');
  } finally {
    emptying.value = false;
  }
}

function formatDate(value: string) {
  return formatShanghaiDateTime(value, 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack trash-page">
    <ContentManagementTabs active="trash" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-card admin-section trash-section">
      <header class="trash-toolbar">
        <div class="trash-filters" :aria-label="t('trash.filters')">
          <button
            v-for="entry in filters"
            :key="entry.id"
            type="button"
            :class="{ active: filter === entry.id }"
            :aria-pressed="filter === entry.id"
            @click="filter = entry.id"
          >{{ t(entry.labelKey) }}</button>
        </div>
        <div class="trash-toolbar-actions">
          <span class="trash-count">{{ t('trash.itemCount', { count: filter === 'all' ? total : filteredItems.length }) }}</span>
          <button class="button danger" type="button" :disabled="!total || emptying" @click="emptyTrash">
            <Trash2 :size="17" /> {{ emptying ? t('trash.emptying') : t('trash.emptyTrash') }}
          </button>
        </div>
      </header>

      <p v-if="loading" class="trash-empty">{{ t('trash.loading') }}</p>
      <p v-else-if="!filteredItems.length" class="trash-empty">{{ items.length ? t('trash.noneInFilter') : t('trash.isEmpty') }}</p>
      <div v-else class="trash-list">
        <article v-for="item in filteredItems" :key="item.id" class="trash-row" :data-testid="`trash-item-${item.id}`">
          <span class="trash-icon"><component :is="kindMeta[item.kind].icon" :size="19" /></span>
          <div class="trash-main">
            <strong>{{ item.label }}</strong>
            <span>{{ t(kindMeta[item.kind].labelKey) }} · {{ t('trash.deletedAt', { date: formatDate(item.deletedAt) }) }}</span>
          </div>
          <div class="trash-actions">
            <button
              class="icon-button secondary"
              type="button"
              :title="t('trash.restore')"
              :aria-label="t('trash.restore')"
              :data-testid="`restore-trash-${item.id}`"
              :disabled="workingIds.has(item.id)"
              @click="restore(item)"
            ><RotateCcw :size="16" /></button>
            <button
              class="icon-button danger"
              type="button"
              :title="t('trash.deleteForever')"
              :aria-label="t('trash.deleteForever')"
              :disabled="workingIds.has(item.id)"
              @click="removePermanently(item)"
            ><Trash2 :size="16" /></button>
          </div>
        </article>
      </div>
      <div v-if="!loading && nextCursor" class="trash-more">
        <button class="button secondary" type="button" data-testid="trash-load-more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? t('trash.loadingMore') : t('trash.loadMore') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.trash-section { min-width: 0; }
.trash-toolbar { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin-bottom: 14px; }
.trash-filters { background: var(--admin-control-bg); border: 1px solid var(--admin-border); border-radius: 8px; display: inline-flex; gap: 2px; padding: 3px; }
.trash-filters button { border-radius: 6px; color: var(--admin-text-muted); font-size: 13px; min-height: 32px; padding: 0 12px; }
.trash-filters button.active { background: var(--admin-surface-elevated); color: var(--admin-text); }
.trash-count { color: var(--admin-text-muted); font-size: 12px; }
.trash-toolbar-actions { align-items: center; display: flex; gap: 10px; }
.trash-list { border: 1px solid var(--admin-border); border-radius: var(--admin-radius-control); overflow: hidden; }
.trash-row { align-items: center; background: var(--admin-surface-elevated); display: grid; gap: 12px; grid-template-columns: 38px minmax(0, 1fr) auto; min-height: 70px; padding: 10px 12px; }
.trash-row + .trash-row { border-top: 1px solid var(--admin-border); }
.trash-icon { align-items: center; background: var(--admin-control-bg); border: 1px solid var(--admin-border); border-radius: 8px; color: var(--admin-accent); display: inline-flex; height: 36px; justify-content: center; width: 36px; }
.trash-main { display: grid; gap: 5px; min-width: 0; }
.trash-main strong { color: var(--admin-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trash-main span, .trash-empty { color: var(--admin-text-muted); font-size: 12px; }
.trash-actions { display: flex; gap: 6px; }
.trash-empty { margin: 0; padding: 28px 4px; text-align: center; }
.trash-more { display: flex; justify-content: center; padding-top: 14px; }
@media (max-width: 640px) {
  .trash-toolbar { align-items: stretch; flex-direction: column; }
  .trash-filters { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); width: 100%; }
  .trash-filters button { padding: 0 4px; }
  .trash-count { align-self: flex-end; }
  .trash-toolbar-actions { justify-content: space-between; width: 100%; }
  .trash-row { grid-template-columns: 36px minmax(0, 1fr); }
  .trash-actions { grid-column: 2; }
}
</style>
