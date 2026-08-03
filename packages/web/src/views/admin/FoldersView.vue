<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { CheckSquare, GripVertical, MoveDown, MoveUp, Pencil, Plus, Save, Square, Trash2, X } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import ContentManagementTabs from '@/components/admin/ContentManagementTabs.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import EmptyState from '@/components/admin/EmptyState.vue';
import FolderIconPicker from '@/components/admin/FolderIconPicker.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import SortableList from '@/components/admin/SortableList.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const confirmApi = useConfirm();
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);
const form = reactive({ id: 0, parentId: null as number | null, name: '', icon: '', description: '', password: '', passwordHint: '' });
const message = ref('');
const error = ref('');
const isInitialLoading = ref(true);
const isSaving = ref(false);
const isCreatingFolder = ref(false);
const sortMode = ref(false);
const draftFolderIds = shallowRef<number[]>([]);
const isSavingSort = ref(false);
const deletingIds = ref(new Set<number>());
const movingFolderIds = ref(new Set<number>());
const selectedFolderIds = ref(new Set<number>());
const isBulkDeleting = ref(false);
const selectedCategoryId = ref<number | null>(null);
const editingFolderId = ref<number | null>(null);
const isSavingInlineFolder = ref(false);
const inlineForm = reactive({
  parentId: null as number | null,
  name: '',
  icon: '',
  description: '',
  passwordHint: '',
});
const selectedFolderCount = computed(() => selectedFolderIds.value.size);
const sortedFolders = computed(() => {
  // Tree order: each category (top-level) followed by its sub-folders.
  const list = [...folders.value].sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id);
  const byId = new Map(list.map((folder) => [folder.id, folder]));
  const byParent = new Map<number, Folder[]>();
  const roots: Folder[] = [];
  for (const folder of list) {
    if (folder.parentId && byId.has(folder.parentId)) {
      const siblings = byParent.get(folder.parentId);
      if (siblings) siblings.push(folder);
      else byParent.set(folder.parentId, [folder]);
    } else {
      roots.push(folder);
    }
  }
  const result: Folder[] = [];
  const visit = (folder: Folder) => {
    result.push(folder);
    for (const child of byParent.get(folder.id) || []) visit(child);
  };
  roots.forEach(visit);
  return result;
});
const folderById = computed(() => new Map(folders.value.map((folder) => [folder.id, folder])));
const categoryFolders = computed(() => sortedFolders.value.filter((folder) => !folder.parentId || !folderById.value.has(folder.parentId)));
const visibleFolderIds = computed(() => {
  if (!selectedCategoryId.value) return new Set<number>();
  return folderTreeIds(selectedCategoryId.value);
});
const categorySortedFolders = computed(() => sortedFolders.value.filter((folder) => visibleFolderIds.value.has(folder.id)));
const sortableFolders = computed(() => sortedFolders.value.filter((folder) => folder.parentId === selectedCategoryId.value));
const displayedFolders = computed(() => {
  if (!sortMode.value) return categorySortedFolders.value;
  return draftFolderIds.value.map((id) => folderById.value.get(id)).filter((folder): folder is Folder => Boolean(folder));
});
const folderDepthById = computed(() => {
  const depths = new Map<number, number>();
  for (const folder of folders.value) {
    let depth = 0;
    let parentId = folder.parentId || null;
    const visited = new Set<number>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = folderById.value.get(parentId);
      if (!parent) break;
      depth += 1;
      parentId = parent.parentId || null;
    }
    depths.set(folder.id, depth);
  }
  return depths;
});
const linkCountsByFolder = computed(() => {
  const counts = new Map<number, number>();
  for (const link of links.value) counts.set(link.folderId, (counts.get(link.folderId) || 0) + 1);
  return counts;
});

async function load() {
  isInitialLoading.value = true;
  try {
    [folders.value, links.value] = await Promise.all([
      apiRequest<Folder[]>('/api/admin/folders'),
      apiRequest<Link[]>('/api/admin/links'),
    ]);
    ensureSelectedCategory();
    selectedFolderIds.value = new Set();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('folders.loadFailed'));
  } finally {
    isInitialLoading.value = false;
  }
}

function folderLinkCount(folderId: number) {
  return linkCountsByFolder.value.get(folderId) || 0;
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

function ensureSelectedCategory() {
  if (categoryFolders.value.some((folder) => folder.id === selectedCategoryId.value)) return;
  selectedCategoryId.value = categoryFolders.value[0]?.id || null;
}

function selectCategory(id: number) {
  if (selectedCategoryId.value === id) return;
  selectedCategoryId.value = id;
  clearFolderSelection();
  cancelInlineEdit();
  stopSorting();
  form.parentId = id;
}

function affectedFolderIds(rootIds: Iterable<number>) {
  const ids = new Set<number>();
  for (const rootId of rootIds) {
    for (const id of folderTreeIds(rootId)) ids.add(id);
  }
  return ids;
}

function toggleFolderSelection(id: number, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const next = new Set(selectedFolderIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedFolderIds.value = next;
}

function selectAllFolders() {
  selectedFolderIds.value = new Set(categorySortedFolders.value.map((folder) => folder.id));
}

function clearFolderSelection() {
  selectedFolderIds.value = new Set();
}

async function bulkDeleteSelected() {
  const ids = [...selectedFolderIds.value];
  if (!ids.length) return;
  const affectedIds = affectedFolderIds(ids);
  const linkCount = links.value.filter((link) => affectedIds.has(link.folderId)).length;
  const confirmed = await confirmApi.confirm({
    title: t('folders.bulkDeleteTitle'),
    message: t('folders.bulkDeleteConfirm', { folders: affectedIds.size, links: linkCount }),
    confirmText: t('common.delete'),
    tone: 'danger',
  });
  if (!confirmed) return;

  isBulkDeleting.value = true;
  try {
    await apiRequest('/api/admin/folders/bulk-delete', { method: 'POST', body: jsonBody({ ids }) });
    folders.value = folders.value.filter((folder) => !affectedIds.has(folder.id));
    links.value = links.value.filter((link) => !affectedIds.has(link.folderId));
    if (affectedIds.has(form.id)) reset();
    ensureSelectedCategory();
    clearFolderSelection();
    notifySuccess(t('folders.bulkDeleted', { folders: affectedIds.size, links: linkCount }));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('folders.bulkDeleteFailed'));
  } finally {
    isBulkDeleting.value = false;
  }
}

function startInlineEdit(folder: Folder) {
  Object.assign(inlineForm, {
    parentId: folder.parentId || null,
    name: folder.name,
    icon: folder.icon || '',
    description: folder.description || '',
    passwordHint: folder.passwordHint || '',
  });
  editingFolderId.value = folder.id;
  stopSorting();
}

function cancelInlineEdit() {
  editingFolderId.value = null;
}

function reset() {
  Object.assign(form, { id: 0, parentId: selectedCategoryId.value, name: '', icon: '', description: '', password: '', passwordHint: '' });
  isCreatingFolder.value = false;
}

function folderPayload() {
  return {
    parentId: selectedCategoryId.value,
    name: form.name,
    icon: form.icon,
    description: form.description,
    password: form.password,
    passwordHint: form.passwordHint,
  };
}

function folderDepth(folder: Folder) {
  return folderDepthById.value.get(folder.id) || 0;
}

function inlineSelectableParents(folderId: number) {
  return categoryFolders.value.filter((folder) => folder.id !== folderId);
}

async function save() {
  if (!selectedCategoryId.value || !form.name.trim() || isSaving.value) return;
  error.value = '';
  message.value = '';
  isSaving.value = true;
  try {
    const payload = folderPayload();
    const saved = await apiRequest<Folder>('/api/admin/folders', { method: 'POST', body: jsonBody(payload) });
    folders.value = [...folders.value, saved];
    if (!selectedCategoryId.value) ensureSelectedCategory();
    message.value = t('folders.created');
    notifySuccess(message.value);
    reset();
  } catch (event) {
    const text = event instanceof Error ? event.message : t('common.saveFailed');
    error.value = text;
    notifyError(text);
  } finally {
    isSaving.value = false;
  }
}

function startCreateFolder() {
  reset();
  form.parentId = selectedCategoryId.value;
  isCreatingFolder.value = true;
  cancelInlineEdit();
  stopSorting();
}

async function moveFolderToNotab(folder: Folder, event: Event) {
  const parentId = Number((event.target as HTMLSelectElement).value);
  if (!Number.isInteger(parentId) || parentId < 1 || parentId === folder.parentId || movingFolderIds.value.has(folder.id)) return;
  movingFolderIds.value = new Set([...movingFolderIds.value, folder.id]);
  try {
    const saved = await apiRequest<Folder>(`/api/admin/folders/${folder.id}`, {
      method: 'PUT',
      body: jsonBody({ parentId }),
    });
    folders.value = folders.value.map((item) => (item.id === folder.id ? { ...item, ...saved } : item));
    selectedCategoryId.value = saved.parentId || saved.id;
    clearFolderSelection();
    notifySuccess(t('folders.moved', { name: saved.name }));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('folders.moveFailed'));
  } finally {
    const next = new Set(movingFolderIds.value);
    next.delete(folder.id);
    movingFolderIds.value = next;
  }
}

async function saveInlineEdit(folder: Folder) {
  if (!inlineForm.name.trim() || isSavingInlineFolder.value) return;
  isSavingInlineFolder.value = true;
  try {
    const payload = {
      parentId: inlineForm.parentId,
      name: inlineForm.name.trim(),
      icon: inlineForm.icon,
      description: inlineForm.description,
      passwordHint: inlineForm.passwordHint.trim(),
    };
    const saved = await apiRequest<Folder>(`/api/admin/folders/${folder.id}`, {
      method: 'PUT',
      body: jsonBody(payload),
    });
    folders.value = folders.value.map((item) => (item.id === folder.id ? { ...item, ...saved } : item));
    selectedCategoryId.value = saved.parentId || saved.id;
    editingFolderId.value = null;
    ensureSelectedCategory();
    notifySuccess(t('folders.updated'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('folders.updateFailed'));
  } finally {
    isSavingInlineFolder.value = false;
  }
}

async function remove(folder: Folder) {
  const affectedFolderIds = folderTreeIds(folder.id);
  const linkCount = links.value.filter((link) => affectedFolderIds.has(link.folderId)).length;
  const confirmed = await confirmApi.confirm({
    title: t('folders.deleteTitle'),
    message: t('folders.deleteConfirm', { name: folder.name, links: linkCount }),
    confirmText: t('common.delete'),
    tone: 'danger',
  });
  if (!confirmed) return;

  deletingIds.value = new Set([...deletingIds.value, folder.id]);
  try {
    await apiRequest(`/api/admin/folders/${folder.id}`, { method: 'DELETE' });
    folders.value = folders.value.filter((item) => !affectedFolderIds.has(item.id));
    links.value = links.value.filter((link) => !affectedFolderIds.has(link.folderId));
    selectedFolderIds.value = new Set([...selectedFolderIds.value].filter((id) => !affectedFolderIds.has(id)));
    if (affectedFolderIds.has(form.id)) reset();
    ensureSelectedCategory();
    notifySuccess(t('folders.deleted'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('folders.deleteFailed'));
  } finally {
    const next = new Set(deletingIds.value);
    next.delete(folder.id);
    deletingIds.value = next;
  }
}

function startSorting() {
  clearFolderSelection();
  cancelInlineEdit();
  draftFolderIds.value = sortableFolders.value.map((folder) => folder.id);
  sortMode.value = true;
}

function stopSorting() {
  sortMode.value = false;
  draftFolderIds.value = [];
}

function reorderDraft(ids: number[]) {
  draftFolderIds.value = ids;
}

function moveDraft(folder: Folder, direction: -1 | 1) {
  const ids = [...draftFolderIds.value];
  const index = ids.indexOf(folder.id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  reorderDraft(ids);
}

async function saveSorting() {
  if (isSavingSort.value) return;
  const ids = [...draftFolderIds.value];
  isSavingSort.value = true;
  try {
    await apiRequest('/api/admin/folders/reorder', { method: 'PUT', body: jsonBody({ ids }) });
    const orderMap = new Map(ids.map((id, orderIndex) => [id, (ids.length - orderIndex) * 10]));
    folders.value = folders.value.map((item) => ({ ...item, sortOrder: orderMap.get(item.id) || item.sortOrder }));
    notifySuccess(t('folders.sortSaved'));
    stopSorting();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('folders.sortSaveFailed'));
  } finally {
    isSavingSort.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader :eyebrow="t('notabs.eyebrow')" :title="t('admin.titleFolders')" />
    <ContentManagementTabs active="folders" />

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-section compact-admin-section">
      <div class="admin-section-head">
        <h2>{{ t('folders.management') }}</h2>
        <div class="toolbar">
          <span v-if="sortMode" class="sort-save-state">{{ t('folders.unsaved') }}</span>
          <button v-if="!sortMode" class="button secondary" data-testid="start-folder-sort" type="button" :disabled="sortableFolders.length < 2" @click="startSorting">
            <GripVertical :size="17" /> {{ t('folders.reorder') }}
          </button>
          <button v-else class="button secondary" type="button" @click="stopSorting"><X :size="17" /> {{ t('common.cancel') }}</button>
        </div>
      </div>
      <LoadingOverlay v-if="isInitialLoading" :label="t('folders.loading')" />
      <EmptyState v-else-if="!sortedFolders.length" :title="t('folders.emptyTitle')" :description="t('folders.emptyBody')">
        <template #action>
          <button class="button" type="button" @click="reset">{{ t('folders.createFolder') }}</button>
        </template>
      </EmptyState>
      <template v-else>
        <nav class="folder-pills category-manager-tabs" :aria-label="t('folders.notabNav')">
          <button
            v-for="category in categoryFolders"
            :key="category.id"
            class="folder-pill"
            :class="{ active: selectedCategoryId === category.id }"
            :aria-pressed="selectedCategoryId === category.id"
            :data-testid="`folder-category-${category.id}`"
            type="button"
            @click="selectCategory(category.id)"
          >
            <FolderGlyph :icon="category.icon" :size="16" />
            {{ category.name }}
          </button>
        </nav>
        <div v-if="!sortMode && selectedFolderCount" class="bulk-action-bar" data-testid="folder-bulk-actions">
          <strong>{{ t('folders.selectedCount', { count: selectedFolderCount }) }}</strong>
          <div class="bulk-controls">
            <button class="button secondary" data-testid="select-all-folders" type="button" @click="selectAllFolders"><CheckSquare :size="17" /> {{ t('folders.selectAll') }}</button>
            <button class="button secondary" type="button" :disabled="!selectedFolderCount" @click="clearFolderSelection"><Square :size="17" /> {{ t('folders.clearSelection') }}</button>
            <button class="button danger" data-testid="bulk-delete-folders" type="button" :disabled="!selectedFolderCount || isBulkDeleting" @click="bulkDeleteSelected">
              <Trash2 :size="17" /> {{ isBulkDeleting ? t('folders.deleting') : t('folders.bulkDelete') }}
            </button>
          </div>
        </div>
        <div class="admin-table folder-table mobile-card-table">
        <div class="admin-table-head">
          <span>{{ t('folders.select') }}</span>
          <span>{{ sortMode ? t('folders.sort') : t('folders.icon') }}</span>
          <span>{{ t('folders.name') }}</span>
          <span>notab</span>
          <span>{{ t('folders.linkCountHeader') }}</span>
          <span>{{ t('folders.aiHint') }}</span>
          <span>{{ t('folders.actions') }}</span>
        </div>
        <SortableList :disabled="!sortMode" :aria-label="t('folders.sortAria')" @reorder="reorderDraft">
          <article
            v-for="(folder, index) in displayedFolders"
            :key="folder.id"
            class="admin-table-row sortable-admin-row"
            :class="{ 'is-inline-editing': editingFolderId === folder.id }"
            :data-testid="`folder-row-${folder.id}`"
            :data-id="folder.id"
            :style="{ '--folder-depth': folderDepth(folder) }"
          >
            <span class="selection-cell" :data-label="t('folders.select')">
              <input
                :data-testid="`select-folder-${folder.id}`"
                type="checkbox"
                :disabled="sortMode"
                :checked="selectedFolderIds.has(folder.id)"
                @change="toggleFolderSelection(folder.id, $event)"
              />
            </span>
            <div v-if="editingFolderId === folder.id" class="inline-folder-editor">
              <div class="inline-folder-field">
                <label>{{ t('folders.icon') }}</label>
                <FolderIconPicker v-model="inlineForm.icon" :test-id="`inline-folder-icon-picker-${folder.id}`" />
              </div>
              <div class="inline-folder-field">
                <label :for="`inline-folder-name-${folder.id}`">{{ t('folders.name') }}</label>
                <input :id="`inline-folder-name-${folder.id}`" v-model="inlineForm.name" :data-testid="`inline-folder-name-${folder.id}`" maxlength="16" />
              </div>
              <div class="inline-folder-field">
                <label :for="`inline-folder-parent-${folder.id}`">{{ t('folders.parentNotab') }}</label>
                <select :id="`inline-folder-parent-${folder.id}`" v-model.number="inlineForm.parentId" :data-testid="`inline-folder-parent-${folder.id}`">
                  <option v-for="parent in inlineSelectableParents(folder.id)" :key="parent.id" :value="parent.id">{{ parent.name }}</option>
                </select>
              </div>
              <div class="inline-folder-field">
                <label :for="`inline-folder-hint-${folder.id}`">{{ t('folders.tagline') }}</label>
                <input :id="`inline-folder-hint-${folder.id}`" v-model="inlineForm.passwordHint" :data-testid="`inline-folder-hint-${folder.id}`" maxlength="30" />
              </div>
              <div class="inline-folder-field inline-folder-ai-prompt">
                <label :for="`inline-folder-ai-prompt-${folder.id}`">{{ t('folders.aiPrompt') }}</label>
                <textarea :id="`inline-folder-ai-prompt-${folder.id}`" v-model="inlineForm.description" :data-testid="`inline-folder-ai-prompt-${folder.id}`" maxlength="400" :placeholder="t('folders.aiPromptPlaceholder')" />
              </div>
              <div class="inline-folder-actions">
                <span>{{ t('folders.linkCount', { count: folderLinkCount(folder.id) }) }}</span>
                <button class="icon-button success" :data-testid="`save-inline-folder-${folder.id}`" :title="t('folders.saveEdit')" :disabled="isSavingInlineFolder" @click="saveInlineEdit(folder)"><Save :size="16" /></button>
                <button class="icon-button secondary" :title="t('folders.cancelEdit')" :disabled="isSavingInlineFolder" @click="cancelInlineEdit"><X :size="16" /></button>
              </div>
            </div>
            <template v-else>
              <span class="folder-sort-cell" :data-label="sortMode ? t('folders.sort') : t('folders.icon')">
                <button v-if="sortMode" class="drag-handle" type="button" :title="t('folders.dragHandle')" :aria-label="t('folders.dragHandleAria')"><GripVertical :size="18" /></button>
                <FolderGlyph :icon="folder.icon" :size="18" />
              </span>
              <div class="folder-name-location" :data-label="t('folders.name')">
                <button class="text-button" type="button" :disabled="sortMode" @click="startInlineEdit(folder)">{{ folder.name }}</button>
              </div>
              <span class="folder-notab-cell" data-label="notab">
                <select
                  v-if="folder.parentId"
                  :value="folder.parentId"
                  :data-testid="`move-folder-${folder.id}`"
                  :aria-label="t('folders.moveToNotab')"
                  :disabled="movingFolderIds.has(folder.id)"
                  @change="moveFolderToNotab(folder, $event)"
                >
                  <option v-for="category in categoryFolders" :key="category.id" :value="category.id">{{ category.name }}</option>
                </select>
                <small v-else>notab</small>
              </span>
              <span :data-label="t('folders.linkCountHeader')">{{ t('folders.linkCount', { count: folderLinkCount(folder.id) }) }}</span>
              <span :data-label="t('folders.aiHint')">{{ folder.description || '-' }}</span>
              <span class="row-actions" :data-label="t('folders.actions')">
                <template v-if="sortMode">
                  <button class="icon-button secondary" :title="t('folders.moveUp')" :disabled="index === 0" @click="moveDraft(folder, -1)"><MoveUp :size="16" /></button>
                  <button class="icon-button secondary" :title="t('folders.moveDown')" :disabled="index === displayedFolders.length - 1" @click="moveDraft(folder, 1)"><MoveDown :size="16" /></button>
                </template>
                <template v-else>
                  <button class="icon-button secondary" :data-testid="`edit-folder-${folder.id}`" :title="t('folders.renameAndIcon')" @click="startInlineEdit(folder)"><Pencil :size="16" /></button>
                  <button class="icon-button danger" :data-testid="`delete-folder-${folder.id}`" :title="t('common.delete')" :disabled="deletingIds.has(folder.id)" @click="remove(folder)"><Trash2 :size="16" /></button>
                </template>
              </span>
            </template>
          </article>
        </SortableList>
        <div v-if="isCreatingFolder && !sortMode" class="inline-folder-editor inline-create-folder-row">
          <div class="inline-folder-field">
            <label>{{ t('folders.icon') }}</label>
            <FolderIconPicker v-model="form.icon" test-id="new-folder-icon-picker" />
          </div>
          <div class="inline-folder-field">
            <label>{{ t('folders.name') }}</label>
            <input v-model="form.name" data-testid="new-folder-name" maxlength="16" @keydown.enter.prevent="save" />
          </div>
          <div class="inline-folder-field">
            <label>{{ t('folders.parentNotab') }}</label>
            <select v-model.number="form.parentId" disabled>
              <option v-for="category in categoryFolders" :key="category.id" :value="category.id">{{ category.name }}</option>
            </select>
          </div>
          <div class="inline-folder-field">
            <label>{{ t('folders.password') }}</label>
            <input v-model="form.password" data-testid="new-folder-password" type="password" />
          </div>
          <div class="inline-folder-field">
            <label>{{ t('folders.tagline') }}</label>
            <input v-model="form.passwordHint" maxlength="30" />
          </div>
          <div class="inline-folder-field inline-folder-ai-prompt">
            <label>{{ t('folders.aiPrompt') }}</label>
            <textarea v-model="form.description" maxlength="400" />
          </div>
          <div class="inline-folder-actions">
            <button class="icon-button success" data-testid="save-new-folder" type="button" :title="t('folders.saveFolder')" :disabled="isSaving" @click="save"><Save :size="16" /></button>
            <button class="icon-button secondary" type="button" :title="t('common.cancel')" @click="reset"><X :size="16" /></button>
          </div>
        </div>
        <button v-else-if="!sortMode" class="add-list-row" data-testid="add-folder-row" type="button" :title="t('folders.addFolder')" @click="startCreateFolder"><Plus :size="18" /></button>
        </div>
      </template>
      <div v-if="sortMode" class="sort-footer sticky-sort-footer">
        <strong>{{ t('folders.total', { count: displayedFolders.length }) }}</strong>
        <div class="toolbar">
          <button class="button secondary" type="button" @click="stopSorting"><X :size="17" /> {{ t('common.cancel') }}</button>
          <button class="button" data-testid="save-folder-sort" type="button" :disabled="isSavingSort" @click="saveSorting"><Save :size="17" /> {{ isSavingSort ? t('common.saving') : t('folders.saveChanges') }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
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

.inline-create-folder-row {
  border-top: 1px solid var(--admin-border);
  margin-top: 8px;
  padding-top: 12px;
}

.category-manager-tabs {
  margin-bottom: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.category-manager-tabs .folder-pill {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 7px;
}

.folder-name-location {
  align-items: center;
  display: grid;
  gap: 5px;
  min-width: 0;
}

.folder-name-location .text-button {
  justify-content: flex-start;
  min-width: 0;
  padding: 0;
  text-align: left;
}

.folder-notab-cell select {
  background: var(--admin-surface);
  border: 1px solid var(--admin-border-strong);
  border-radius: 7px;
  color: var(--muted);
  font-size: 11px;
  min-height: 28px;
  min-width: 0;
  padding: 3px 7px;
  width: min(100%, 150px);
}

.folder-notab-cell small {
  color: var(--muted);
  font-size: 11px;
}

.folder-table .admin-table-row.is-inline-editing {
  align-items: start;
  min-height: 0;
  padding-block: 14px;
}

.inline-folder-editor {
  align-items: end;
  display: grid;
  gap: 12px;
  grid-column: 2 / -1;
  grid-template-columns: minmax(190px, 1.4fr) minmax(120px, 0.8fr) minmax(150px, 0.9fr) minmax(150px, 1fr) auto;
  min-width: 0;
}

.inline-folder-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.inline-folder-field label {
  color: var(--admin-text-muted);
  font-size: 11px;
  font-weight: 800;
}

.inline-folder-field input,
.inline-folder-field select,
.inline-folder-field textarea {
  background: var(--admin-surface-elevated);
  border: 1px solid var(--admin-border-strong);
  border-radius: 8px;
  color: var(--text);
  font: inherit;
  min-height: 38px;
  min-width: 0;
  padding: 7px 10px;
  width: 100%;
}

.inline-folder-field textarea {
  min-height: 64px;
  resize: vertical;
}

.inline-folder-ai-prompt {
  grid-column: 1 / -1;
}

.inline-folder-field input:focus,
.inline-folder-field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.12);
  outline: none;
}

.inline-folder-actions {
  align-items: center;
  display: flex;
  gap: 7px;
  min-height: 38px;
  white-space: nowrap;
}

.inline-folder-actions > span {
  color: var(--admin-text-muted);
  font-size: 12px;
  margin-right: 2px;
}

@media (max-width: 980px) {
  .inline-folder-editor {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .inline-folder-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  .inline-folder-editor {
    grid-column: 1 / -1;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .inline-folder-actions {
    grid-column: auto;
    justify-content: flex-start;
  }
}
</style>
