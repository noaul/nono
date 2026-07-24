<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Folder, Layers3, Link2, RotateCcw, Trash2 } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest } from '@/api/client';
import type { TrashItem, TrashItemKind } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { useToasts } from '@/composables/useToasts';

type TrashFilter = 'all' | TrashItemKind;

const items = ref<TrashItem[]>([]);
const filter = ref<TrashFilter>('all');
const loading = ref(true);
const workingIds = ref(new Set<string>());
const emptying = ref(false);
const error = ref('');
const confirmApi = useConfirm();
const toasts = useToasts();

const filters: Array<{ id: TrashFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'bookmark', label: '书签' },
  { id: 'folder', label: '文件夹' },
  { id: 'notab', label: 'Notab' },
];
const kindMeta = {
  bookmark: { label: '书签', icon: Link2 },
  folder: { label: '文件夹', icon: Folder },
  notab: { label: 'Notab', icon: Layers3 },
} as const;
const filteredItems = computed(() => filter.value === 'all' ? items.value : items.value.filter((item) => item.kind === filter.value));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    items.value = await apiRequest<TrashItem[]>('/api/admin/trash');
  } catch (event) {
    error.value = event instanceof Error ? event.message : '回收站加载失败';
  } finally {
    loading.value = false;
  }
}

function setWorking(id: string, active: boolean) {
  const next = new Set(workingIds.value);
  if (active) next.add(id);
  else next.delete(id);
  workingIds.value = next;
}

async function restore(item: TrashItem) {
  if (workingIds.value.has(item.id)) return;
  if (!await confirmApi.confirm({ title: `恢复${kindMeta[item.kind].label}`, message: `将「${item.label}」恢复到原来的位置。`, confirmText: '恢复' })) return;
  setWorking(item.id, true);
  try {
    await apiRequest(`/api/admin/trash/${item.id}/restore`, { method: 'POST' });
    items.value = items.value.filter((entry) => entry.id !== item.id);
    toasts.push(`${kindMeta[item.kind].label}已恢复`, 'success');
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : '恢复失败', 'error');
  } finally {
    setWorking(item.id, false);
  }
}

async function removePermanently(item: TrashItem) {
  if (workingIds.value.has(item.id)) return;
  if (!await confirmApi.confirm({
    title: '永久删除',
    message: `「${item.label}」删除后无法恢复。`,
    confirmText: '永久删除',
    tone: 'danger',
  })) return;
  setWorking(item.id, true);
  try {
    await apiRequest(`/api/admin/trash/${item.id}`, { method: 'DELETE' });
    items.value = items.value.filter((entry) => entry.id !== item.id);
    toasts.push('已永久删除', 'success');
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : '删除失败', 'error');
  } finally {
    setWorking(item.id, false);
  }
}

async function emptyTrash() {
  if (!items.value.length || emptying.value) return;
  if (!await confirmApi.confirm({
    title: '清空回收站',
    message: `永久删除回收站中的 ${items.value.length} 个项目，此操作无法撤销。`,
    confirmText: '清空',
    tone: 'danger',
  })) return;
  emptying.value = true;
  try {
    await apiRequest('/api/admin/trash', { method: 'DELETE' });
    items.value = [];
    toasts.push('回收站已清空', 'success');
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : '清空失败', 'error');
  } finally {
    emptying.value = false;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack trash-page">
    <AdminPageHeader eyebrow="系统" title="回收站" description="删除的书签、文件夹和 Notab 会保留在这里，直到手动清空。">
      <template #actions>
        <button class="button danger" type="button" :disabled="!items.length || emptying" @click="emptyTrash">
          <Trash2 :size="17" /> {{ emptying ? '清空中' : '清空回收站' }}
        </button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-section trash-section">
      <header class="trash-toolbar">
        <div class="trash-filters" aria-label="回收站筛选">
          <button
            v-for="entry in filters"
            :key="entry.id"
            type="button"
            :class="{ active: filter === entry.id }"
            :aria-pressed="filter === entry.id"
            @click="filter = entry.id"
          >{{ entry.label }}</button>
        </div>
        <span class="trash-count">{{ filteredItems.length }} 项</span>
      </header>

      <p v-if="loading" class="trash-empty">正在读取回收站</p>
      <p v-else-if="!filteredItems.length" class="trash-empty">{{ items.length ? '当前筛选下没有项目' : '回收站是空的' }}</p>
      <div v-else class="trash-list">
        <article v-for="item in filteredItems" :key="item.id" class="trash-row" :data-testid="`trash-item-${item.id}`">
          <span class="trash-icon"><component :is="kindMeta[item.kind].icon" :size="19" /></span>
          <div class="trash-main">
            <strong>{{ item.label }}</strong>
            <span>{{ kindMeta[item.kind].label }} · 删除于 {{ formatDate(item.deletedAt) }}</span>
          </div>
          <div class="trash-actions">
            <button
              class="icon-button secondary"
              type="button"
              title="恢复"
              aria-label="恢复"
              :data-testid="`restore-trash-${item.id}`"
              :disabled="workingIds.has(item.id)"
              @click="restore(item)"
            ><RotateCcw :size="16" /></button>
            <button
              class="icon-button danger"
              type="button"
              title="永久删除"
              aria-label="永久删除"
              :disabled="workingIds.has(item.id)"
              @click="removePermanently(item)"
            ><Trash2 :size="16" /></button>
          </div>
        </article>
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
.trash-list { border: 1px solid var(--admin-border); border-radius: var(--admin-radius-control); overflow: hidden; }
.trash-row { align-items: center; background: var(--admin-surface-elevated); display: grid; gap: 12px; grid-template-columns: 38px minmax(0, 1fr) auto; min-height: 70px; padding: 10px 12px; }
.trash-row + .trash-row { border-top: 1px solid var(--admin-border); }
.trash-icon { align-items: center; background: var(--admin-control-bg); border: 1px solid var(--admin-border); border-radius: 8px; color: var(--admin-accent); display: inline-flex; height: 36px; justify-content: center; width: 36px; }
.trash-main { display: grid; gap: 5px; min-width: 0; }
.trash-main strong { color: var(--admin-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trash-main span, .trash-empty { color: var(--admin-text-muted); font-size: 12px; }
.trash-actions { display: flex; gap: 6px; }
.trash-empty { margin: 0; padding: 28px 4px; text-align: center; }
@media (max-width: 640px) {
  .trash-toolbar { align-items: stretch; flex-direction: column; }
  .trash-filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); width: 100%; }
  .trash-filters button { padding: 0 4px; }
  .trash-count { align-self: flex-end; }
  .trash-row { grid-template-columns: 36px minmax(0, 1fr); }
  .trash-actions { grid-column: 2; }
}
</style>
