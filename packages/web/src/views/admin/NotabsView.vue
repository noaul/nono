<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { GripVertical, Layers, MoveDown, MoveUp, Pencil, Save, Trash2, X } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import EmptyState from '@/components/admin/EmptyState.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import SortableList from '@/components/admin/SortableList.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';

const confirmApi = useConfirm();
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);
const isInitialLoading = ref(true);
const editingNotabId = ref<number | null>(null);
const editingName = ref('');
const savingNotabIds = ref(new Set<number>());
const deletingNotabIds = ref(new Set<number>());
const sortMode = ref(false);
const draftNotabIds = shallowRef<number[]>([]);
const isSavingSort = ref(false);

const folderById = computed(() => new Map(folders.value.map((folder) => [folder.id, folder])));
const notabs = computed(() => [...folders.value]
  .filter((folder) => !folder.parentId || !folderById.value.has(folder.parentId))
  .sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));
const displayedNotabs = computed(() => {
  if (!sortMode.value) return notabs.value;
  return draftNotabIds.value.map((id) => folderById.value.get(id)).filter((folder): folder is Folder => Boolean(folder));
});

async function load() {
  isInitialLoading.value = true;
  try {
    [folders.value, links.value] = await Promise.all([
      apiRequest<Folder[]>('/api/admin/folders'),
      apiRequest<Link[]>('/api/admin/links'),
    ]);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '加载 Notab 失败');
  } finally {
    isInitialLoading.value = false;
  }
}

function folderTreeIds(rootId: number) {
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders.value) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function descendantFolderCount(notabId: number) {
  return Math.max(0, folderTreeIds(notabId).size - 1);
}

function bookmarkCount(notabId: number) {
  const ids = folderTreeIds(notabId);
  return links.value.filter((link) => ids.has(link.folderId)).length;
}

function startRename(notab: Folder) {
  editingNotabId.value = notab.id;
  editingName.value = notab.name;
  stopSorting();
}

function cancelRename() {
  editingNotabId.value = null;
  editingName.value = '';
}

async function saveRename(notab: Folder) {
  const name = editingName.value.trim();
  if (!name || savingNotabIds.value.has(notab.id)) return;
  savingNotabIds.value = new Set([...savingNotabIds.value, notab.id]);
  try {
    const saved = await apiRequest<Folder>(`/api/admin/folders/${notab.id}`, {
      method: 'PUT',
      body: jsonBody({ name }),
    });
    folders.value = folders.value.map((folder) => (folder.id === notab.id ? { ...folder, ...saved } : folder));
    cancelRename();
    notifySuccess('Notab 名称已更新');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : 'Notab 更名失败');
  } finally {
    const next = new Set(savingNotabIds.value);
    next.delete(notab.id);
    savingNotabIds.value = next;
  }
}

async function removeNotab(notab: Folder) {
  const affectedIds = folderTreeIds(notab.id);
  const childCount = Math.max(0, affectedIds.size - 1);
  const affectedBookmarks = links.value.filter((link) => affectedIds.has(link.folderId)).length;
  const confirmed = await confirmApi.confirm({
    title: '删除 Notab',
    message: `确定删除「${notab.name}」吗？其下 ${childCount} 个文件夹和 ${affectedBookmarks} 个书签会一起删除，此操作无法撤销。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  deletingNotabIds.value = new Set([...deletingNotabIds.value, notab.id]);
  try {
    await apiRequest(`/api/admin/folders/${notab.id}`, { method: 'DELETE' });
    folders.value = folders.value.filter((folder) => !affectedIds.has(folder.id));
    links.value = links.value.filter((link) => !affectedIds.has(link.folderId));
    if (editingNotabId.value && affectedIds.has(editingNotabId.value)) cancelRename();
    notifySuccess('Notab 已删除');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : 'Notab 删除失败');
  } finally {
    const next = new Set(deletingNotabIds.value);
    next.delete(notab.id);
    deletingNotabIds.value = next;
  }
}

function startSorting() {
  cancelRename();
  draftNotabIds.value = notabs.value.map((notab) => notab.id);
  sortMode.value = true;
}

function stopSorting() {
  sortMode.value = false;
  draftNotabIds.value = [];
}

function reorderDraft(ids: number[]) {
  draftNotabIds.value = ids;
}

function moveDraft(notab: Folder, direction: -1 | 1) {
  const ids = [...draftNotabIds.value];
  const index = ids.indexOf(notab.id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
  [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
  reorderDraft(ids);
}

async function saveSorting() {
  if (isSavingSort.value) return;
  const ids = [...draftNotabIds.value];
  isSavingSort.value = true;
  try {
    await apiRequest('/api/admin/folders/reorder', {
      method: 'PUT',
      body: jsonBody({ ids }),
    });
    const orderMap = new Map(ids.map((id, index) => [id, (ids.length - index) * 10]));
    folders.value = folders.value.map((folder) => ({ ...folder, sortOrder: orderMap.get(folder.id) || folder.sortOrder }));
    notifySuccess('Notab 顺序已保存');
    stopSorting();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : 'Notab 排序保存失败');
  } finally {
    isSavingSort.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader eyebrow="导航内容" title="Notab 管理" description="集中更名、排序或删除导航页的顶级 Notab。" />

    <section class="admin-section">
      <div class="admin-section-head">
        <div>
          <h2>Notab 列表</h2>
          <p>{{ sortMode ? '拖动 Notab 调整前台分类顺序，完成后统一保存。' : '集中更名、排序或删除导航页的顶级 Notab。' }}</p>
        </div>
        <div class="toolbar">
          <span v-if="sortMode" class="sort-save-state">更改尚未保存</span>
          <button
            v-if="!sortMode"
            class="button secondary"
            data-testid="start-notab-sort"
            type="button"
            :disabled="notabs.length < 2"
            @click="startSorting"
          >
            <GripVertical :size="17" /> 调整顺序
          </button>
          <button v-else class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 取消</button>
        </div>
      </div>

      <LoadingOverlay v-if="isInitialLoading" label="正在加载 Notab" />
      <EmptyState v-else-if="!notabs.length" title="还没有 Notab" description="请先在文件夹页面创建一个顶级 Notab。" />
      <div v-else class="admin-table notab-table mobile-card-table" :class="{ 'is-sorting': sortMode }">
        <div class="admin-table-head">
          <span>{{ sortMode ? '排序' : '图标' }}</span>
          <span>名称</span>
          <span>文件夹</span>
          <span>书签</span>
          <span>操作</span>
        </div>
        <SortableList :disabled="!sortMode" aria-label="Notab 排序" @reorder="reorderDraft">
          <article
            v-for="(notab, index) in displayedNotabs"
            :key="notab.id"
            class="admin-table-row sortable-admin-row"
            :data-testid="`notab-row-${notab.id}`"
            :data-id="notab.id"
          >
            <span class="folder-sort-cell" :data-label="sortMode ? '排序' : '图标'">
              <button v-if="sortMode" class="drag-handle" type="button" title="拖动调整顺序" aria-label="拖动调整 Notab 顺序"><GripVertical :size="18" /></button>
              <FolderGlyph v-else :icon="notab.icon" :size="19" />
            </span>
            <span class="notab-name-cell" data-label="名称">
              <input
                v-if="editingNotabId === notab.id"
                v-model="editingName"
                :data-testid="`notab-name-${notab.id}`"
                maxlength="16"
                aria-label="Notab 名称"
                @keydown.enter.prevent="saveRename(notab)"
                @keydown.esc.prevent="cancelRename"
              />
              <button v-else class="text-button" type="button" :disabled="sortMode" @click="startRename(notab)">{{ notab.name }}</button>
            </span>
            <span data-label="文件夹">{{ descendantFolderCount(notab.id) }} 个文件夹</span>
            <span data-label="书签">{{ bookmarkCount(notab.id) }} 个书签</span>
            <span class="row-actions" data-label="操作">
              <template v-if="sortMode">
                <button class="icon-button secondary" title="上移" :disabled="index === 0" @click="moveDraft(notab, -1)"><MoveUp :size="16" /></button>
                <button class="icon-button secondary" title="下移" :disabled="index === displayedNotabs.length - 1" @click="moveDraft(notab, 1)"><MoveDown :size="16" /></button>
              </template>
              <template v-else-if="editingNotabId === notab.id">
                <button class="icon-button success" :data-testid="`save-notab-${notab.id}`" title="保存名称" :disabled="savingNotabIds.has(notab.id)" @click="saveRename(notab)"><Save :size="16" /></button>
                <button class="icon-button secondary" title="取消更名" :disabled="savingNotabIds.has(notab.id)" @click="cancelRename"><X :size="16" /></button>
              </template>
              <template v-else>
                <button class="icon-button secondary" :data-testid="`edit-notab-${notab.id}`" title="重命名" @click="startRename(notab)"><Pencil :size="16" /></button>
                <button class="icon-button danger" :data-testid="`delete-notab-${notab.id}`" title="删除 Notab" :disabled="deletingNotabIds.has(notab.id)" @click="removeNotab(notab)"><Trash2 :size="16" /></button>
              </template>
            </span>
          </article>
        </SortableList>
      </div>

      <div v-if="sortMode" class="sort-footer sticky-sort-footer">
        <strong><Layers :size="17" /> {{ displayedNotabs.length }} 个 Notab · 拖动期间不会发起网络请求</strong>
        <div class="toolbar">
          <button class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 取消</button>
          <button class="button" data-testid="save-notab-sort" type="button" :disabled="isSavingSort" @click="saveSorting"><Save :size="17" /> {{ isSavingSort ? '保存中' : '保存变更' }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.notab-table .admin-table-head,
.notab-table .admin-table-row {
  grid-template-columns: 72px minmax(220px, 1.5fr) minmax(120px, 0.7fr) minmax(120px, 0.7fr) 180px;
  min-width: 760px;
}

.notab-name-cell {
  align-items: center;
  display: flex;
  min-width: 0;
}

.notab-name-cell input {
  max-width: 360px;
  width: 100%;
}

.sort-footer strong {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

@media (max-width: 720px) {
  .notab-table .admin-table-row {
    grid-template-columns: 1fr !important;
    min-width: 0;
  }

  .notab-name-cell input {
    max-width: none;
  }
}
</style>
