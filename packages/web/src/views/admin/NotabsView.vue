<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { GripVertical, Link2, MoveDown, MoveUp, Pencil, Plus, Save, Trash2, X } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import SortableList from '@/components/admin/SortableList.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link, NavigationEntry, Site } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';
import { defaultNavigationEntries, getNavigationEntries, navigationEntriesVersion } from '@/utils/navigationEntries';
import { getPortalSettings, portalDefaults } from '@/utils/portal';

const confirmApi = useConfirm();
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);
const site = ref<Site | null>(null);
const isInitialLoading = ref(true);
const editingNotabId = ref<number | null>(null);
const editingName = ref('');
const savingNotabIds = ref(new Set<number>());
const deletingNotabIds = ref(new Set<number>());
const sortMode = ref(false);
const draftNotabIds = shallowRef<number[]>([]);
const isSavingSort = ref(false);
const isCreatingNotab = ref(false);
const isSavingNotab = ref(false);
const newNotab = reactive({ name: '', icon: '', description: '' });
const portal = reactive({ ...portalDefaults, label: 'Nodesk', url: '/nodesk' });
const navigationEntries = ref<NavigationEntry[]>(defaultNavigationEntries.map((entry) => ({ ...entry })));
const isSavingEntries = ref(false);

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
    const [loadedFolders, loadedLinks, loadedSite] = await Promise.all([
      apiRequest<Folder[]>('/api/admin/folders'),
      apiRequest<Link[]>('/api/admin/links'),
      apiRequest<Site>('/api/admin/site'),
    ]);
    folders.value = loadedFolders;
    links.value = loadedLinks;
    site.value = loadedSite;
    Object.assign(portal, getPortalSettings(loadedSite?.settings, '/nodesk'));
    navigationEntries.value = getNavigationEntries(loadedSite?.settings);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '加载 Notab 失败');
  } finally {
    isInitialLoading.value = false;
  }
}

function startCreateNotab() {
  Object.assign(newNotab, { name: '', icon: '', description: '' });
  isCreatingNotab.value = true;
  stopSorting();
}

function cancelCreateNotab() {
  isCreatingNotab.value = false;
  Object.assign(newNotab, { name: '', icon: '', description: '' });
}

async function saveNewNotab() {
  const name = newNotab.name.trim();
  if (!name || isSavingNotab.value) return;
  isSavingNotab.value = true;
  try {
    const saved = await apiRequest<Folder>('/api/admin/folders', {
      method: 'POST',
      body: jsonBody({ parentId: null, name, icon: newNotab.icon, description: newNotab.description }),
    });
    folders.value = [...folders.value, saved];
    cancelCreateNotab();
    notifySuccess('Notab 已新增');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : 'Notab 新增失败');
  } finally {
    isSavingNotab.value = false;
  }
}

function addNavigationEntry() {
  const index = navigationEntries.value.length + 1;
  navigationEntries.value = [...navigationEntries.value, {
    id: `entry-${index}`,
    label: '',
    url: '',
    icon: 'link',
    enabled: true,
    openInNewTab: false,
  }];
}

function removeNavigationEntry(index: number) {
  navigationEntries.value = navigationEntries.value.filter((_, entryIndex) => entryIndex !== index);
}

async function saveNavigationEntries() {
  if (isSavingEntries.value) return;
  isSavingEntries.value = true;
  try {
    const settings = {
      ...(site.value?.settings || {}),
      portal: { ...portal },
      navigationEntries: navigationEntries.value.map((entry) => ({
        ...entry,
        label: entry.label.trim(),
        url: entry.url.trim(),
      })),
      navigationEntriesVersion,
    };
    const saved = await apiRequest<Site>('/api/admin/site', {
      method: 'PUT',
      body: jsonBody({ settings }),
    });
    site.value = saved;
    Object.assign(portal, getPortalSettings(saved?.settings || settings, '/nodesk'));
    navigationEntries.value = getNavigationEntries(saved?.settings || settings);
    notifySuccess('入口设置已保存');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '入口设置保存失败');
  } finally {
    isSavingEntries.value = false;
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
    <AdminPageHeader eyebrow="导航内容" title="Notab 管理" />

    <section class="admin-section compact-admin-section" data-testid="entry-management">
      <div class="admin-section-head">
        <h2>入口管理</h2>
        <button class="button" data-testid="save-navigation-entries" type="button" :disabled="isSavingEntries" @click="saveNavigationEntries">
          <Save :size="17" /> {{ isSavingEntries ? '保存中' : '保存' }}
        </button>
      </div>
      <div class="entry-list">
        <div class="entry-editor-row">
          <span class="entry-icon"><Link2 :size="17" /></span>
          <input v-model="portal.label" aria-label="Nodesk 名称" maxlength="60" />
          <input v-model="portal.url" aria-label="Nodesk 地址" maxlength="2048" />
          <label class="compact-toggle"><input v-model="portal.enabled" type="checkbox" /> 启用</label>
          <span class="entry-kind">Nodesk</span>
        </div>
        <div v-for="(entry, index) in navigationEntries" :key="entry.id" class="entry-editor-row">
          <span class="entry-icon"><Link2 :size="17" /></span>
          <input v-model="entry.label" :data-testid="index === navigationEntries.length - 1 && entry.id.startsWith('entry-') ? 'new-entry-label' : undefined" aria-label="入口名称" maxlength="60" placeholder="名称" />
          <input v-model="entry.url" :data-testid="index === navigationEntries.length - 1 && entry.id.startsWith('entry-') ? 'new-entry-url' : undefined" aria-label="入口地址" maxlength="2048" placeholder="/path 或 https://" />
          <label class="compact-toggle"><input v-model="entry.enabled" type="checkbox" /> 启用</label>
          <button class="icon-button danger" type="button" title="删除入口" @click="removeNavigationEntry(index)"><Trash2 :size="16" /></button>
        </div>
        <button class="add-list-row" data-testid="add-navigation-entry" type="button" title="新增入口" @click="addNavigationEntry">
          <Plus :size="18" />
        </button>
      </div>
    </section>

    <section class="admin-section compact-admin-section" data-testid="notab-management">
      <div class="admin-section-head">
        <h2>Notab 列表</h2>
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
        <article v-if="isCreatingNotab" class="admin-table-row inline-create-row">
          <span class="folder-sort-cell"><Plus :size="18" /></span>
          <span class="notab-name-cell"><input v-model="newNotab.name" data-testid="new-notab-name" maxlength="16" aria-label="新 Notab 名称" @keydown.enter.prevent="saveNewNotab" /></span>
          <span></span>
          <span></span>
          <span class="row-actions">
            <button class="icon-button success" data-testid="save-new-notab" type="button" title="保存 Notab" :disabled="isSavingNotab" @click="saveNewNotab"><Save :size="16" /></button>
            <button class="icon-button secondary" type="button" title="取消" @click="cancelCreateNotab"><X :size="16" /></button>
          </span>
        </article>
        <button v-else-if="!sortMode" class="add-list-row" data-testid="add-notab-row" type="button" title="新增 Notab" @click="startCreateNotab"><Plus :size="18" /></button>
      </div>

      <div v-if="sortMode" class="sort-footer sticky-sort-footer">
        <strong>{{ displayedNotabs.length }} 个 Notab</strong>
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

.entry-list {
  display: grid;
  gap: 8px;
}

.entry-editor-row {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: 36px minmax(120px, 0.7fr) minmax(220px, 1.5fr) auto 38px;
}

.entry-icon,
.entry-kind {
  align-items: center;
  color: #64748b;
  display: inline-flex;
  font-size: 12px;
  justify-content: center;
}

.compact-toggle {
  align-items: center;
  display: inline-flex;
  font-size: 13px;
  gap: 6px;
  white-space: nowrap;
}

.add-list-row {
  align-items: center;
  background: rgba(255, 255, 255, 0.35);
  border: 1px dashed rgba(100, 116, 139, 0.38);
  border-radius: var(--admin-surface-radius, 8px);
  color: #64748b;
  display: flex;
  justify-content: center;
  min-height: 42px;
  width: 100%;
}

.add-list-row:hover {
  background: rgba(255, 255, 255, 0.62);
  color: #0f766e;
}

@media (max-width: 720px) {
  .entry-editor-row {
    grid-template-columns: 32px minmax(0, 1fr) 38px;
  }

  .entry-editor-row > input:nth-of-type(2),
  .compact-toggle {
    grid-column: 2 / -1;
  }
  .notab-table .admin-table-row {
    grid-template-columns: 1fr !important;
    min-width: 0;
  }

  .notab-name-cell input {
    max-width: none;
  }
}
</style>
