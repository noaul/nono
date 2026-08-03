<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { GripVertical, Link2, MoveDown, MoveUp, Pencil, Plus, Save, Trash2, X } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import ContentManagementTabs from '@/components/admin/ContentManagementTabs.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import SortableList from '@/components/admin/SortableList.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link, NavigationEntry, Site } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';
import { defaultNavigationEntries, getNavigationEntries, navigationEntriesVersion } from '@/utils/navigationEntries';
import { getPortalSettings, portalDefaults } from '@/utils/portal';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

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
    notifyError(event instanceof Error ? event.message : t('notabs.loadFailed'));
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
    notifySuccess(t('notabs.created'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('notabs.createFailed'));
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
    notifySuccess(t('notabs.entriesSaved'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('notabs.entriesSaveFailed'));
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
    notifySuccess(t('notabs.renamed'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('notabs.renameFailed'));
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
    title: t('notabs.deleteTitle'),
    message: t('notabs.deleteConfirm', { name: notab.name, folders: childCount, bookmarks: affectedBookmarks }),
    confirmText: t('common.delete'),
    tone: 'danger',
  });
  if (!confirmed) return;

  deletingNotabIds.value = new Set([...deletingNotabIds.value, notab.id]);
  try {
    await apiRequest(`/api/admin/folders/${notab.id}`, { method: 'DELETE' });
    folders.value = folders.value.filter((folder) => !affectedIds.has(folder.id));
    links.value = links.value.filter((link) => !affectedIds.has(link.folderId));
    if (editingNotabId.value && affectedIds.has(editingNotabId.value)) cancelRename();
    notifySuccess(t('notabs.deleted'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('notabs.deleteFailed'));
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
    notifySuccess(t('notabs.sortSaved'));
    stopSorting();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('notabs.sortSaveFailed'));
  } finally {
    isSavingSort.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader :eyebrow="t('notabs.eyebrow')" :title="t('admin.titleNotabs')" />
    <ContentManagementTabs active="notabs" />

    <section class="admin-section compact-admin-section" data-testid="entry-management">
      <div class="admin-section-head">
        <h2>{{ t('notabs.entryManagement') }}</h2>
        <button class="button" data-testid="save-navigation-entries" type="button" :disabled="isSavingEntries" @click="saveNavigationEntries">
          <Save :size="17" /> {{ isSavingEntries ? t('common.saving') : t('common.save') }}
        </button>
      </div>
      <div class="entry-list">
        <div class="entry-editor-row">
          <span class="entry-icon"><Link2 :size="17" /></span>
          <input v-model="portal.label" :aria-label="t('notabs.nodeskName')" maxlength="60" />
          <input v-model="portal.url" :aria-label="t('notabs.nodeskUrl')" maxlength="2048" />
          <label class="compact-toggle"><input v-model="portal.enabled" type="checkbox" /> {{ t('notabs.enabled') }}</label>
          <span class="entry-kind">Nodesk</span>
        </div>
        <div v-for="(entry, index) in navigationEntries" :key="entry.id" class="entry-editor-row">
          <span class="entry-icon"><Link2 :size="17" /></span>
          <input v-model="entry.label" :data-testid="index === navigationEntries.length - 1 && entry.id.startsWith('entry-') ? 'new-entry-label' : undefined" :aria-label="t('notabs.entryName')" maxlength="60" :placeholder="t('notabs.namePlaceholder')" />
          <input v-model="entry.url" :data-testid="index === navigationEntries.length - 1 && entry.id.startsWith('entry-') ? 'new-entry-url' : undefined" :aria-label="t('notabs.entryUrl')" maxlength="2048" :placeholder="t('notabs.urlPlaceholder')" />
          <label class="compact-toggle"><input v-model="entry.enabled" type="checkbox" /> {{ t('notabs.enabled') }}</label>
          <button class="icon-button danger" type="button" :title="t('notabs.deleteEntry')" @click="removeNavigationEntry(index)"><Trash2 :size="16" /></button>
        </div>
        <button class="add-list-row" data-testid="add-navigation-entry" type="button" :title="t('notabs.addEntry')" @click="addNavigationEntry">
          <Plus :size="18" />
        </button>
      </div>
    </section>

    <section class="admin-section compact-admin-section" data-testid="notab-management">
      <div class="admin-section-head">
        <h2>{{ t('notabs.list') }}</h2>
        <div class="toolbar">
          <span v-if="sortMode" class="sort-save-state">{{ t('notabs.unsaved') }}</span>
          <button
            v-if="!sortMode"
            class="button secondary"
            data-testid="start-notab-sort"
            type="button"
            :disabled="notabs.length < 2"
            @click="startSorting"
          >
            <GripVertical :size="17" /> {{ t('notabs.reorder') }}
          </button>
          <button v-else class="button secondary" type="button" @click="stopSorting"><X :size="17" /> {{ t('common.cancel') }}</button>
        </div>
      </div>

      <LoadingOverlay v-if="isInitialLoading" :label="t('notabs.loading')" />
      <div v-else class="admin-table notab-table mobile-card-table" :class="{ 'is-sorting': sortMode }">
        <div class="admin-table-head">
          <span>{{ sortMode ? t('notabs.sort') : t('notabs.icon') }}</span>
          <span>{{ t('notabs.name') }}</span>
          <span>{{ t('notabs.folders') }}</span>
          <span>{{ t('notabs.bookmarks') }}</span>
          <span>{{ t('notabs.actions') }}</span>
        </div>
        <SortableList :disabled="!sortMode" :aria-label="t('notabs.sortAria')" @reorder="reorderDraft">
          <article
            v-for="(notab, index) in displayedNotabs"
            :key="notab.id"
            class="admin-table-row sortable-admin-row"
            :data-testid="`notab-row-${notab.id}`"
            :data-id="notab.id"
          >
            <span class="folder-sort-cell" :data-label="sortMode ? t('notabs.sort') : t('notabs.icon')">
              <button v-if="sortMode" class="drag-handle" type="button" :title="t('notabs.dragHandle')" :aria-label="t('notabs.dragHandleAria')"><GripVertical :size="18" /></button>
              <FolderGlyph v-else :icon="notab.icon" :size="19" />
            </span>
            <span class="notab-name-cell" :data-label="t('notabs.name')">
              <input
                v-if="editingNotabId === notab.id"
                v-model="editingName"
                :data-testid="`notab-name-${notab.id}`"
                maxlength="16"
                :aria-label="t('notabs.nameAria')"
                @keydown.enter.prevent="saveRename(notab)"
                @keydown.esc.prevent="cancelRename"
              />
              <button v-else class="text-button" type="button" :disabled="sortMode" @click="startRename(notab)">{{ notab.name }}</button>
            </span>
            <span :data-label="t('notabs.folders')">{{ t('notabs.folderCount', { count: descendantFolderCount(notab.id) }) }}</span>
            <span :data-label="t('notabs.bookmarks')">{{ t('notabs.bookmarkCount', { count: bookmarkCount(notab.id) }) }}</span>
            <span class="row-actions" :data-label="t('notabs.actions')">
              <template v-if="sortMode">
                <button class="icon-button secondary" :title="t('notabs.moveUp')" :disabled="index === 0" @click="moveDraft(notab, -1)"><MoveUp :size="16" /></button>
                <button class="icon-button secondary" :title="t('notabs.moveDown')" :disabled="index === displayedNotabs.length - 1" @click="moveDraft(notab, 1)"><MoveDown :size="16" /></button>
              </template>
              <template v-else-if="editingNotabId === notab.id">
                <button class="icon-button success" :data-testid="`save-notab-${notab.id}`" :title="t('notabs.saveName')" :disabled="savingNotabIds.has(notab.id)" @click="saveRename(notab)"><Save :size="16" /></button>
                <button class="icon-button secondary" :title="t('notabs.cancelRename')" :disabled="savingNotabIds.has(notab.id)" @click="cancelRename"><X :size="16" /></button>
              </template>
              <template v-else>
                <button class="icon-button secondary" :data-testid="`edit-notab-${notab.id}`" :title="t('notabs.rename')" @click="startRename(notab)"><Pencil :size="16" /></button>
                <button class="icon-button danger" :data-testid="`delete-notab-${notab.id}`" :title="t('notabs.deleteTitle')" :disabled="deletingNotabIds.has(notab.id)" @click="removeNotab(notab)"><Trash2 :size="16" /></button>
              </template>
            </span>
          </article>
        </SortableList>
        <article v-if="isCreatingNotab" class="admin-table-row inline-create-row">
          <span class="folder-sort-cell"><Plus :size="18" /></span>
          <span class="notab-name-cell"><input v-model="newNotab.name" data-testid="new-notab-name" maxlength="16" :aria-label="t('notabs.newNameAria')" @keydown.enter.prevent="saveNewNotab" /></span>
          <span></span>
          <span></span>
          <span class="row-actions">
            <button class="icon-button success" data-testid="save-new-notab" type="button" :title="t('notabs.saveNotab')" :disabled="isSavingNotab" @click="saveNewNotab"><Save :size="16" /></button>
            <button class="icon-button secondary" type="button" :title="t('common.cancel')" @click="cancelCreateNotab"><X :size="16" /></button>
          </span>
        </article>
        <button v-else-if="!sortMode" class="add-list-row" data-testid="add-notab-row" type="button" :title="t('notabs.addNotab')" @click="startCreateNotab"><Plus :size="18" /></button>
      </div>

      <div v-if="sortMode" class="sort-footer sticky-sort-footer">
        <strong>{{ t('notabs.total', { count: displayedNotabs.length }) }}</strong>
        <div class="toolbar">
          <button class="button secondary" type="button" @click="stopSorting"><X :size="17" /> {{ t('common.cancel') }}</button>
          <button class="button" data-testid="save-notab-sort" type="button" :disabled="isSavingSort" @click="saveSorting"><Save :size="17" /> {{ isSavingSort ? t('common.saving') : t('notabs.saveChanges') }}</button>
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
  color: var(--admin-text-muted);
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
  background: var(--admin-surface-sunken);
  border: 1px dashed var(--admin-border-strong);
  border-radius: var(--admin-surface-radius, 8px);
  color: var(--admin-text-muted);
  display: flex;
  justify-content: center;
  min-height: 42px;
  width: 100%;
}

.add-list-row:hover {
  background: var(--admin-surface);
  color: var(--admin-accent);
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
