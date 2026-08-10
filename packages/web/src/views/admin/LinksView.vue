<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { Activity, Eye, GripVertical, Link2, MoveDown, MoveUp, Pencil, Plus, Save, Trash2, X } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import ContentManagementTabs from '@/components/admin/ContentManagementTabs.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import LinkDuplicatePanel from '@/components/admin/LinkDuplicatePanel.vue';
import FolderIconPicker from '@/components/admin/FolderIconPicker.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import SortableFolderPills from '@/components/admin/SortableFolderPills.vue';
import SortableList from '@/components/admin/SortableList.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { BulkLinkResult, DuplicateLinkGroup, Folder, Link, LinkHealthResult, LinkHealthSummary } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const confirmApi = useConfirm();
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);
const selectedCategoryId = ref<number>(0);
const selectedFolderId = ref<number>(0);
const sortMode = ref(false);
const draftLinkIds = shallowRef<number[]>([]);
const form = reactive({ id: 0, folderId: 0, name: '', url: '', icon: '', description: '' });
const formCategoryId = ref(0);
const error = ref('');
const message = ref('');
const isInitialLoading = ref(true);
const isSaving = ref(false);
const isCreatingLink = ref(false);
const isSavingSort = ref(false);
const deletingIds = ref(new Set<number>());
const searchTerm = ref('');
const selectedLinkIds = ref(new Set<number>());
const duplicateGroups = ref<DuplicateLinkGroup[]>([]);
const isBulkWorking = ref(false);
const isLoadingDuplicates = ref(false);
const isCheckingHealth = ref(false);
const editingLinkId = ref<number | null>(null);
const inlineForm = reactive({ name: '', url: '', categoryId: 0, folderId: 0 });
const folderEditorOpen = ref(false);
const isCreatingFolder = ref(false);
const isSavingFolder = ref(false);
const isDeletingFolder = ref(false);
const isSavingFolderSort = ref(false);
const folderEditor = reactive({
  parentId: 0,
  name: '',
  icon: '',
  description: '',
  password: '',
  passwordHint: '',
});

function healthStatusLabel(status: Link['healthStatus']) {
  if (status === 'ok') return t('health.ok');
  if (status === 'redirected') return t('health.redirected');
  if (status === 'restricted') return t('health.restricted');
  if (status === 'broken') return t('health.broken');
  if (status === 'timeout') return t('health.timeout');
  if (status === 'invalid') return t('health.invalid');
  return t('links.unchecked');
}

function healthStatusTitle(link: Link) {
  if (!link.healthStatus) return t('links.noHealthCheck');
  return [
    healthStatusLabel(link.healthStatus),
    link.healthStatusCode,
    link.healthReason,
    link.healthCheckedAt ? t('links.checkedAt', { date: new Date(link.healthCheckedAt).toLocaleString() }) : '',
  ].filter(Boolean).join(' · ');
}

const sortedFolders = computed(() => [...folders.value].sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));
const folderById = computed(() => new Map(folders.value.map((folder) => [folder.id, folder])));
const categoryFolders = computed(() => sortedFolders.value.filter((folder) => !folder.parentId || !folderById.value.has(folder.parentId)));
const categoryFolderGroups = computed(() => categoryFolders.value.map((category) => ({
  category,
  folders: folderTree(category.id),
})));
const formCategoryFolders = computed(() => foldersForCategory(formCategoryId.value));
const selectedCategoryFolders = computed(() => {
  return categoryFolderGroups.value.find((item) => item.category.id === selectedCategoryId.value)?.folders || [];
});
const selectedCategoryFolder = computed(() => folderById.value.get(selectedCategoryId.value));
const sortableCategoryFolders = computed(() => selectedCategoryFolders.value.filter((folder) => folder.parentId === selectedCategoryId.value));
const nestedCategoryFolders = computed(() => selectedCategoryFolders.value.filter((folder) => (
  folder.id !== selectedCategoryId.value && folder.parentId !== selectedCategoryId.value
)));
const activeFolder = computed(() => selectedCategoryFolders.value.find((folder) => folder.id === selectedFolderId.value));
const activeFolderLinks = computed(() => links.value.filter((link) => link.folderId === activeFolder.value?.id).sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));
const activeFolderLinkCount = computed(() => activeFolderLinks.value.length);
const linkById = computed(() => new Map(links.value.map((link) => [link.id, link])));
const selectedCount = computed(() => selectedLinkIds.value.size);
const allFilteredSelected = computed(() => filteredLinks.value.length > 0 && filteredLinks.value.every((link) => selectedLinkIds.value.has(link.id)));
const filteredLinks = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  const base = sortMode.value
    ? draftLinkIds.value.map((id) => linkById.value.get(id)).filter((link): link is Link => Boolean(link))
    : activeFolderLinks.value;
  if (!query) return base;
  return base.filter((link) => [link.name, link.url, link.description || ''].join(' ').toLowerCase().includes(query));
});

function folderTree(rootId: number) {
  const result: Folder[] = [];
  const visit = (folder: Folder) => {
    result.push(folder);
    for (const child of sortedFolders.value.filter((item) => item.parentId === folder.id)) visit(child);
  };
  const root = folderById.value.get(rootId);
  if (root) visit(root);
  return result;
}

function preferredFolderId(categoryId: number) {
  return sortedFolders.value.find((folder) => folder.parentId === categoryId)?.id || categoryId;
}

function foldersForCategory(categoryId: number) {
  return categoryFolderGroups.value.find((item) => item.category.id === categoryId)?.folders || [];
}

function categoryIdForFolder(folderId: number) {
  let folder = folderById.value.get(folderId);
  const visited = new Set<number>();
  while (folder?.parentId && !visited.has(folder.id)) {
    visited.add(folder.id);
    folder = folderById.value.get(folder.parentId);
  }
  return folder?.id || 0;
}

function ensureCreationSelection() {
  const firstCategoryId = categoryFolders.value[0]?.id || 0;
  if (!categoryFolders.value.some((folder) => folder.id === formCategoryId.value)) {
    formCategoryId.value = categoryIdForFolder(form.folderId) || firstCategoryId;
  }
  if (!formCategoryFolders.value.some((folder) => folder.id === form.folderId)) {
    form.folderId = preferredFolderId(formCategoryId.value);
  }
}

function ensureCategorySelection() {
  if (!categoryFolders.value.some((folder) => folder.id === selectedCategoryId.value)) {
    selectedCategoryId.value = categoryFolders.value[0]?.id || 0;
  }
  if (!selectedCategoryFolders.value.some((folder) => folder.id === selectedFolderId.value)) {
    selectedFolderId.value = preferredFolderId(selectedCategoryId.value);
  }
}

async function load() {
  isInitialLoading.value = true;
  try {
    [folders.value, links.value] = await Promise.all([apiRequest<Folder[]>('/api/admin/folders'), apiRequest<Link[]>('/api/admin/links')]);
    ensureCategorySelection();
    ensureCreationSelection();
    selectedLinkIds.value = new Set();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('links.loadFailed'));
  } finally {
    isInitialLoading.value = false;
  }
}

function selectCategory(category: Folder) {
  selectedCategoryId.value = category.id;
  selectedFolderId.value = preferredFolderId(category.id);
  closeFolderEditor();
  clearManagementState();
}

function selectFolder(folder: Folder) {
  selectedFolderId.value = folder.id;
  closeFolderEditor();
  clearManagementState();
}

function startFolderEdit() {
  const folder = activeFolder.value;
  if (!folder?.parentId || isSavingFolderSort.value) return;
  Object.assign(folderEditor, {
    parentId: folder.parentId,
    name: folder.name,
    icon: folder.icon || '',
    description: folder.description || '',
    password: '',
    passwordHint: folder.passwordHint || '',
  });
  isCreatingFolder.value = false;
  folderEditorOpen.value = true;
  cancelInlineEdit();
  stopSorting();
}

function startFolderCreate() {
  if (isSavingFolderSort.value) return;
  Object.assign(folderEditor, {
    parentId: selectedCategoryId.value,
    name: '',
    icon: '',
    description: '',
    password: '',
    passwordHint: '',
  });
  isCreatingFolder.value = true;
  folderEditorOpen.value = true;
  cancelInlineEdit();
  stopSorting();
}

function closeFolderEditor() {
  folderEditorOpen.value = false;
  isCreatingFolder.value = false;
}

async function saveFolderEditor() {
  if (!folderEditor.name.trim() || !folderEditor.parentId || isSavingFolder.value || isSavingFolderSort.value) return;
  const current = activeFolder.value;
  if (!isCreatingFolder.value && !current?.parentId) return;
  const creating = isCreatingFolder.value;

  isSavingFolder.value = true;
  try {
    const payload = {
      parentId: folderEditor.parentId,
      name: folderEditor.name.trim(),
      icon: folderEditor.icon,
      description: folderEditor.description,
      passwordHint: folderEditor.passwordHint.trim(),
      ...(creating && folderEditor.password ? { password: folderEditor.password } : {}),
    };
    const saved = creating
      ? await apiRequest<Folder>('/api/admin/folders', { method: 'POST', body: jsonBody(payload) })
      : await apiRequest<Folder>(`/api/admin/folders/${current!.id}`, { method: 'PUT', body: jsonBody(payload) });
    folders.value = creating
      ? [...folders.value, saved]
      : folders.value.map((folder) => (folder.id === saved.id ? { ...folder, ...saved } : folder));
    selectedCategoryId.value = saved.parentId || saved.id;
    selectedFolderId.value = saved.id;
    closeFolderEditor();
    notifySuccess(t(creating ? 'folders.created' : 'folders.updated'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t(creating ? 'common.saveFailed' : 'folders.updateFailed'));
  } finally {
    isSavingFolder.value = false;
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

async function removeActiveFolder() {
  const folder = activeFolder.value;
  if (!folder?.parentId || isDeletingFolder.value || isSavingFolderSort.value) return;
  const affectedIds = folderTreeIds(folder.id);
  const linkCount = links.value.filter((link) => affectedIds.has(link.folderId)).length;
  const confirmed = await confirmApi.confirm({
    title: t('folders.deleteTitle'),
    message: t('folders.deleteConfirm', { name: folder.name, links: linkCount }),
    confirmText: t('common.delete'),
    tone: 'danger',
  });
  if (!confirmed) return;

  isDeletingFolder.value = true;
  try {
    await apiRequest(`/api/admin/folders/${folder.id}`, { method: 'DELETE' });
    folders.value = folders.value.filter((item) => !affectedIds.has(item.id));
    links.value = links.value.filter((link) => !affectedIds.has(link.folderId));
    selectedFolderId.value = preferredFolderId(selectedCategoryId.value);
    closeFolderEditor();
    notifySuccess(t('folders.deleted'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('folders.deleteFailed'));
  } finally {
    isDeletingFolder.value = false;
  }
}

async function saveFolderPillOrder(ids: number[]) {
  if (ids.length < 2 || isSavingFolderSort.value || folderEditorOpen.value || isSavingFolder.value || isDeletingFolder.value) return;
  const previousSortOrders = new Map(
    ids.map((id) => [id, folderById.value.get(id)?.sortOrder]).filter((entry): entry is [number, number] => entry[1] !== undefined),
  );
  const orderMap = new Map(ids.map((id, index) => [id, (ids.length - index) * 10]));
  folders.value = folders.value.map((folder) => (orderMap.has(folder.id) ? { ...folder, sortOrder: orderMap.get(folder.id)! } : folder));
  isSavingFolderSort.value = true;
  try {
    await apiRequest('/api/admin/folders/reorder', { method: 'PUT', body: jsonBody({ ids }) });
    notifySuccess(t('folders.sortSaved'));
  } catch (event) {
    folders.value = folders.value.map((folder) => (
      previousSortOrders.has(folder.id) ? { ...folder, sortOrder: previousSortOrders.get(folder.id)! } : folder
    ));
    notifyError(event instanceof Error ? event.message : t('folders.sortSaveFailed'));
  } finally {
    isSavingFolderSort.value = false;
  }
}

function clearManagementState() {
  searchTerm.value = '';
  selectedLinkIds.value = new Set();
  cancelInlineEdit();
  stopSorting();
}

function startInlineEdit(link: Link) {
  Object.assign(inlineForm, {
    name: link.name,
    url: link.url,
    categoryId: categoryIdForFolder(link.folderId),
    folderId: link.folderId,
  });
  editingLinkId.value = link.id;
  stopSorting();
}

function cancelInlineEdit() {
  editingLinkId.value = null;
}

function selectInlineCategory() {
  inlineForm.folderId = preferredFolderId(inlineForm.categoryId);
}

async function saveInlineEdit(link: Link) {
  if (!inlineForm.name.trim() || !inlineForm.url.trim() || !inlineForm.folderId) return;
  try {
    const payload = {
      name: inlineForm.name.trim(),
      url: inlineForm.url.trim(),
      folderId: inlineForm.folderId,
    };
    const saved = await apiRequest<Link>(`/api/admin/links/${link.id}`, { method: 'PUT', body: jsonBody(payload) });
    links.value = links.value.map((item) => (item.id === link.id ? { ...item, ...saved } : item));
    editingLinkId.value = null;
    notifySuccess(t('links.updated'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('links.updateFailed'));
  }
}

function reset() {
  Object.assign(form, {
    id: 0,
    folderId: preferredFolderId(formCategoryId.value) || sortedFolders.value[0]?.id || 0,
    name: '',
    url: '',
    icon: '',
    description: '',
  });
  isCreatingLink.value = false;
}

function startCreateLink() {
  reset();
  formCategoryId.value = selectedCategoryId.value || categoryFolders.value[0]?.id || 0;
  form.folderId = preferredFolderId(formCategoryId.value);
  isCreatingLink.value = true;
  cancelInlineEdit();
  stopSorting();
}

async function save() {
  if (!form.name.trim() || !form.url.trim() || !form.folderId || isSaving.value) return;
  error.value = '';
  message.value = '';
  isSaving.value = true;
  try {
    const payload = {
      folderId: form.folderId,
      name: form.name.trim(),
      url: form.url.trim(),
      icon: form.icon,
      description: form.description,
    };
    const saved = form.id
      ? await apiRequest<Link>(`/api/admin/links/${form.id}`, { method: 'PUT', body: jsonBody(payload) })
      : await apiRequest<Link>('/api/admin/links', { method: 'POST', body: jsonBody(payload) });
    links.value = form.id ? links.value.map((link) => (link.id === saved.id ? saved : link)) : [...links.value, saved];
    selectedCategoryId.value = categoryIdForFolder(saved.folderId);
    selectedFolderId.value = saved.folderId;
    message.value = form.id ? t('links.updated') : t('links.created');
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

async function remove(link: Link) {
  const confirmed = await confirmApi.confirm({
    title: t('links.deleteTitle'),
    message: t('links.deleteConfirm', { name: link.name }),
    confirmText: t('common.delete'),
    tone: 'danger',
  });
  if (!confirmed) return;

  deletingIds.value = new Set([...deletingIds.value, link.id]);
  try {
    await apiRequest(`/api/admin/links/${link.id}`, { method: 'DELETE' });
    links.value = links.value.filter((item) => item.id !== link.id);
    notifySuccess(t('links.deleted'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('links.deleteFailed'));
  } finally {
    const next = new Set(deletingIds.value);
    next.delete(link.id);
    deletingIds.value = next;
  }
}

function toggleLinkSelection(id: number, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const next = new Set(selectedLinkIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedLinkIds.value = next;
}

function toggleAllFilteredLinks() {
  const next = new Set(selectedLinkIds.value);
  if (allFilteredSelected.value) {
    for (const link of filteredLinks.value) next.delete(link.id);
  } else {
    for (const link of filteredLinks.value) next.add(link.id);
  }
  selectedLinkIds.value = next;
}

async function bulkDeleteSelected() {
  const ids = [...selectedLinkIds.value];
  if (!ids.length) return;

  const confirmed = await confirmApi.confirm({
    title: t('links.bulkDeleteTitle'),
    message: t('links.bulkDeleteConfirm', { count: ids.length }),
    confirmText: t('common.delete'),
    tone: 'danger',
  });
  if (!confirmed) return;

  isBulkWorking.value = true;
  try {
    const result = await apiRequest<BulkLinkResult>('/api/admin/links/bulk-delete', { method: 'POST', body: jsonBody({ ids }) });
    const deletedIds = new Set(ids);
    links.value = links.value.filter((link) => !deletedIds.has(link.id));
    selectedLinkIds.value = new Set();
    notifySuccess(t('links.bulkDeleted', { count: result.deleted ?? ids.length }));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('links.bulkDeleteFailed'));
  } finally {
    isBulkWorking.value = false;
  }
}

async function loadDuplicates() {
  isLoadingDuplicates.value = true;
  try {
    const result = await apiRequest<{ groups: DuplicateLinkGroup[] }>('/api/admin/links/duplicates');
    duplicateGroups.value = result.groups;
    notifySuccess(result.groups.length ? t('links.duplicatesFound', { count: result.groups.length }) : t('links.noDuplicates'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('links.duplicatesFailed'));
  } finally {
    isLoadingDuplicates.value = false;
  }
}

async function checkLinkHealth() {
  const ids = selectedCount.value ? [...selectedLinkIds.value] : filteredLinks.value.map((link) => link.id);
  if (!ids.length) return;

  isCheckingHealth.value = true;
  try {
    const result = await apiRequest<{ summary: LinkHealthSummary; results: LinkHealthResult[] }>('/api/admin/links/health-check', { method: 'POST', body: jsonBody({ ids }) });
    mergeHealthResults(result.results);
    notifySuccess(t('links.healthDone', { count: result.summary.total }));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('links.healthFailed'));
  } finally {
    isCheckingHealth.value = false;
  }
}

function mergeHealthResults(results: LinkHealthResult[]) {
  const byId = new Map(results.map((result) => [result.id, result]));
  links.value = links.value.map((link) => {
    const result = byId.get(link.id);
    if (!result) return link;
    return {
      ...link,
      healthStatus: result.status,
      healthStatusCode: result.statusCode ?? null,
      healthReason: result.reason ?? null,
      healthFinalUrl: result.finalUrl ?? null,
      healthCheckedAt: result.checkedAt,
    };
  });
}

function folderName(folderId: number) {
  return folders.value.find((folder) => folder.id === folderId)?.name || '-';
}

function categoryName(folderId: number) {
  return folderById.value.get(categoryIdForFolder(folderId))?.name || '-';
}

function startSorting() {
  searchTerm.value = '';
  selectedLinkIds.value = new Set();
  draftLinkIds.value = activeFolderLinks.value.map((link) => link.id);
  sortMode.value = true;
}

function stopSorting() {
  sortMode.value = false;
  draftLinkIds.value = [];
}

function moveDraft(link: Link, direction: -1 | 1) {
  const ids = [...draftLinkIds.value];
  const index = ids.indexOf(link.id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  draftLinkIds.value = ids;
}

function reorderDraft(ids: number[]) {
  draftLinkIds.value = ids;
}

async function saveSorting() {
  if (isSavingSort.value) return;
  isSavingSort.value = true;
  try {
    const ids = [...draftLinkIds.value];
    await apiRequest('/api/admin/links/reorder', { method: 'PUT', body: jsonBody({ ids }) });
    const orderMap = new Map(ids.map((id, index) => [id, (ids.length - index) * 10]));
    links.value = links.value.map((link) => (orderMap.has(link.id) ? { ...link, sortOrder: orderMap.get(link.id)! } : link));
    message.value = t('links.sortSaved');
    notifySuccess(message.value);
    stopSorting();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('links.sortSaveFailed'));
  } finally {
    isSavingSort.value = false;
  }
}

watch(formCategoryId, (categoryId) => {
  if (!formCategoryFolders.value.some((folder) => folder.id === form.folderId)) {
    form.folderId = preferredFolderId(categoryId);
  }
});

onMounted(load);
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader :eyebrow="t('notabs.eyebrow')" :title="t('admin.titleLinks')" />
    <ContentManagementTabs active="links" />

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-section compact-admin-section">
      <div class="admin-section-head">
        <h2>{{ t('links.list') }}</h2>
      </div>
      <LoadingOverlay v-if="isInitialLoading" :label="t('links.loading')" />
      <template v-else>
        <div class="management-filter-group">
          <div class="management-filter-label">notab</div>
          <nav class="folder-pills" :aria-label="t('links.notabNav')">
            <button
              v-for="category in categoryFolders"
              :key="category.id"
              class="folder-pill"
              :class="{ active: category.id === selectedCategoryId }"
              :aria-pressed="category.id === selectedCategoryId"
              :data-testid="`link-category-${category.id}`"
              type="button"
              @click="selectCategory(category)"
            >
              <FolderGlyph :icon="category.icon" :size="15" />{{ category.name }}
            </button>
          </nav>
        </div>
        <div class="management-filter-group">
          <div class="management-filter-label">{{ t('links.folder') }}</div>
          <div class="folder-pills folder-pill-sort-area">
            <button
              v-if="selectedCategoryFolder"
              class="folder-pill"
              :class="{ active: selectedCategoryId === activeFolder?.id }"
              :aria-pressed="selectedCategoryId === activeFolder?.id"
              data-testid="root-folder-pill"
              type="button"
              @click="selectFolder(selectedCategoryFolder)"
            >
              <FolderGlyph :icon="selectedCategoryFolder.icon" :size="15" />{{ selectedCategoryFolder.name }}
            </button>
            <SortableFolderPills
              :disabled="isSavingFolderSort || folderEditorOpen || isSavingFolder || isDeletingFolder || sortableCategoryFolders.length < 2"
              :aria-label="t('folders.sortAria')"
              @reorder="saveFolderPillOrder"
            >
              <button
                v-for="folder in sortableCategoryFolders"
                :key="folder.id"
                class="folder-pill sortable-folder-pill"
                :class="{ active: folder.id === activeFolder?.id }"
                :aria-pressed="folder.id === activeFolder?.id"
                aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                :data-id="folder.id"
                :data-testid="`sortable-folder-pill-${folder.id}`"
                type="button"
                @click="selectFolder(folder)"
              >
                <GripVertical class="folder-pill-grip" :size="13" aria-hidden="true" />
                <FolderGlyph :icon="folder.icon" :size="15" />{{ folder.name }}
              </button>
            </SortableFolderPills>
            <button
              v-for="folder in nestedCategoryFolders"
              :key="folder.id"
              class="folder-pill nested-folder-pill"
              :class="{ active: folder.id === activeFolder?.id }"
              :aria-pressed="folder.id === activeFolder?.id"
              :data-testid="`nested-folder-pill-${folder.id}`"
              type="button"
              @click="selectFolder(folder)"
            >
              <FolderGlyph :icon="folder.icon" :size="15" />{{ folder.name }}
            </button>
          </div>
        </div>

        <section id="folder-management" class="folder-management-panel" data-testid="folder-management" aria-labelledby="folder-management-title">
          <div class="folder-management-head">
            <div>
              <span id="folder-management-title">{{ t('folders.management') }}</span>
              <strong>{{ activeFolder?.name || t('links.noFolderSelected') }}</strong>
            </div>
            <button class="button secondary" data-testid="create-folder" type="button" :disabled="!selectedCategoryId || folderEditorOpen || isSavingFolderSort" @click="startFolderCreate">
              <Plus :size="16" /> {{ t('folders.createFolder') }}
            </button>
          </div>

          <form v-if="folderEditorOpen" class="folder-editor-form" data-testid="folder-editor" @submit.prevent="saveFolderEditor">
            <div class="folder-editor-field folder-editor-icon">
              <span>{{ t('folders.icon') }}</span>
              <FolderIconPicker v-model="folderEditor.icon" test-id="folder-editor-icon-picker" />
            </div>
            <label class="folder-editor-field folder-editor-name">
              <span>{{ t('folders.name') }}</span>
              <input v-model="folderEditor.name" data-testid="folder-editor-name" maxlength="16" required />
            </label>
            <label class="folder-editor-field">
              <span>{{ t('folders.parentNotab') }}</span>
              <select v-model.number="folderEditor.parentId" data-testid="folder-editor-category" required>
                <option v-for="category in categoryFolders" :key="category.id" :value="category.id">{{ category.name }}</option>
              </select>
            </label>
            <label v-if="isCreatingFolder" class="folder-editor-field">
              <span>{{ t('folders.password') }}</span>
              <input v-model="folderEditor.password" data-testid="folder-editor-password" type="password" />
            </label>
            <label class="folder-editor-field">
              <span>{{ t('folders.tagline') }}</span>
              <input v-model="folderEditor.passwordHint" data-testid="folder-editor-hint" maxlength="30" />
            </label>
            <label class="folder-editor-field folder-editor-description">
              <span>{{ t('folders.aiPrompt') }}</span>
              <textarea v-model="folderEditor.description" data-testid="folder-editor-description" maxlength="400" :placeholder="t('folders.aiPromptPlaceholder')" />
            </label>
            <div class="folder-editor-actions">
              <button class="button secondary" type="button" :disabled="isSavingFolder" @click="closeFolderEditor"><X :size="16" /> {{ t('common.cancel') }}</button>
              <button class="button" data-testid="save-folder-editor" type="button" :disabled="isSavingFolder || !folderEditor.name.trim()" @click="saveFolderEditor"><Save :size="16" /> {{ isSavingFolder ? t('common.saving') : t('folders.saveEdit') }}</button>
            </div>
          </form>

          <div v-else-if="activeFolder" class="folder-summary-table" role="table" :aria-label="t('folders.management')">
            <div class="folder-summary-head" role="row">
              <span role="columnheader">{{ t('folders.icon') }}</span>
              <span class="folder-summary-name" role="columnheader">{{ t('folders.name') }}</span>
              <span role="columnheader">notab</span>
              <span role="columnheader">{{ t('folders.linkCountHeader') }}</span>
              <span role="columnheader">{{ t('folders.aiHint') }}</span>
              <span role="columnheader">{{ t('folders.actions') }}</span>
            </div>
            <div class="folder-summary-row" role="row">
              <span role="cell"><FolderGlyph :icon="activeFolder.icon" :size="18" /></span>
              <strong class="folder-summary-name" data-testid="active-folder-name" role="cell">{{ activeFolder.name }}</strong>
              <span role="cell">{{ activeFolder.parentId ? categoryName(activeFolder.id) : 'notab' }}</span>
              <span role="cell">{{ t('folders.linkCount', { count: activeFolderLinkCount }) }}</span>
              <span class="folder-summary-description" role="cell">{{ activeFolder.description || '-' }}</span>
              <span class="row-actions" role="cell">
                <template v-if="activeFolder.parentId">
                  <button class="icon-button secondary" data-testid="edit-active-folder" type="button" :title="t('folders.renameAndIcon')" :disabled="isSavingFolderSort" @click="startFolderEdit"><Pencil :size="16" /></button>
                  <button class="icon-button danger" data-testid="delete-active-folder" type="button" :title="t('common.delete')" :disabled="isDeletingFolder || isSavingFolderSort" @click="removeActiveFolder"><Trash2 :size="16" /></button>
                </template>
                <a v-else class="button secondary folder-notab-link" href="/admin/notabs">{{ t('admin.navNotabs') }}</a>
              </span>
            </div>
          </div>
        </section>

        <div id="bookmark-tools" class="bulk-action-bar">
          <strong>{{ sortMode ? t('links.sortingTitle') : selectedCount ? t('links.selectedCount', { count: selectedCount }) : t('links.bulkActions') }}</strong>
          <div class="bulk-list-tools">
            <button v-if="!sortMode" class="button secondary" data-testid="start-link-sort" type="button" :disabled="!activeFolderLinks.length" @click="startSorting"><GripVertical :size="17" /> {{ t('links.reorder') }}</button>
            <button v-else class="button secondary" type="button" @click="stopSorting"><X :size="17" /> {{ t('links.exitSort') }}</button>
            <button class="button secondary" data-testid="load-duplicates" type="button" :disabled="isLoadingDuplicates || sortMode" @click="loadDuplicates">
              <Link2 :size="17" /> {{ isLoadingDuplicates ? t('links.checking') : t('links.findDuplicates') }}
            </button>
            <input data-testid="link-search" v-model="searchTerm" class="admin-search-input" :disabled="sortMode" :placeholder="sortMode ? t('links.searchPaused') : t('links.searchPlaceholder')" />
          </div>
          <div v-if="!sortMode" class="bulk-controls">
            <button class="button secondary" data-testid="select-all-links" type="button" :disabled="!filteredLinks.length || isBulkWorking" @click="toggleAllFilteredLinks">
              {{ allFilteredSelected ? t('links.deselectAll') : t('links.selectAllCurrent') }}
            </button>
            <button class="button secondary" data-testid="check-link-health" type="button" :disabled="isCheckingHealth || (!selectedCount && !filteredLinks.length)" @click="checkLinkHealth">
              <Activity :size="17" /> {{ isCheckingHealth ? t('links.checking') : t('links.healthCheck') }}
            </button>
            <button class="button danger" data-testid="bulk-delete" type="button" :disabled="!selectedCount || isBulkWorking" @click="bulkDeleteSelected">
              <Trash2 :size="17" /> {{ t('common.delete') }}
            </button>
          </div>
        </div>
        <LinkDuplicatePanel :groups="duplicateGroups" :folder-name="folderName" />
        <div class="admin-table bookmark-table mobile-card-table" :class="{ 'is-sorting': sortMode }">
          <div class="admin-table-head">
            <span>{{ t('links.select') }}</span>
            <span></span>
            <span>{{ t('links.name') }}</span>
            <span>{{ t('links.url') }}</span>
            <span>{{ t('links.folder') }}</span>
            <span>notab</span>
            <span>{{ t('links.status') }}</span>
            <span>{{ t('links.actions') }}</span>
          </div>
          <SortableList :disabled="!sortMode" :aria-label="t('links.sortAria')" @reorder="reorderDraft">
            <article v-for="(link, index) in filteredLinks" :key="link.id" class="admin-table-row sortable-admin-row" :data-testid="`link-row-${link.id}`" :data-id="link.id">
              <span class="selection-cell" :data-label="t('links.select')">
                <input :data-testid="`select-link-${link.id}`" type="checkbox" :disabled="sortMode" :checked="selectedLinkIds.has(link.id)" @change="toggleLinkSelection(link.id, $event)" />
              </span>
              <span class="sort-cell" :data-label="t('links.sort')">
                <button v-if="sortMode" class="drag-handle" type="button" :title="t('links.dragHandle')" :aria-label="t('links.dragHandleAria')"><GripVertical :size="18" /></button>
                <Link2 v-else :size="16" />
              </span>
              <span :data-label="t('links.name')">
                <input
                  v-if="editingLinkId === link.id"
                  v-model="inlineForm.name"
                  class="inline-link-input"
                  :data-testid="`inline-link-name-${link.id}`"
                  maxlength="24"
                />
                <span v-else :data-testid="`link-name-${link.id}`">{{ link.name }}</span>
              </span>
              <span class="url-cell" :data-label="t('links.url')">
                <input
                  v-if="editingLinkId === link.id"
                  v-model="inlineForm.url"
                  class="inline-link-input"
                  :data-testid="`inline-link-url-${link.id}`"
                  type="url"
                />
                <template v-else>{{ link.url }}</template>
              </span>
              <span :data-label="t('links.folder')">
                <select
                  v-if="editingLinkId === link.id"
                  v-model.number="inlineForm.folderId"
                  class="inline-link-select"
                  :data-testid="`inline-link-folder-${link.id}`"
                  :aria-label="t('links.linkFolder')"
                >
                  <option v-for="folder in foldersForCategory(inlineForm.categoryId)" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
                </select>
                <template v-else>{{ folderName(link.folderId) }}</template>
              </span>
              <span data-label="notab">
                <select
                  v-if="editingLinkId === link.id"
                  v-model.number="inlineForm.categoryId"
                  class="inline-link-select"
                  :data-testid="`inline-link-category-${link.id}`"
                  :aria-label="t('links.notabNav')"
                  @change="selectInlineCategory"
                >
                  <option v-for="category in categoryFolders" :key="category.id" :value="category.id">{{ category.name }}</option>
                </select>
                <template v-else>{{ categoryName(link.folderId) }}</template>
              </span>
              <span
                class="link-health-cell"
                :class="`status-${link.healthStatus || 'unchecked'}`"
                :data-label="t('links.status')"
                :data-testid="`link-health-${link.id}`"
                :title="healthStatusTitle(link)"
              >
                <span class="link-health-value"><i aria-hidden="true"></i>{{ healthStatusLabel(link.healthStatus) }}</span>
              </span>
              <span class="row-actions" :data-label="t('links.actions')">
                <template v-if="sortMode">
                  <button class="icon-button secondary" :title="t('links.moveUp')" :disabled="index === 0" @click="moveDraft(link, -1)"><MoveUp :size="16" /></button>
                  <button class="icon-button secondary" :title="t('links.moveDown')" :disabled="index === filteredLinks.length - 1" @click="moveDraft(link, 1)"><MoveDown :size="16" /></button>
                </template>
                <template v-else>
                  <template v-if="editingLinkId === link.id">
                    <button class="icon-button success" :data-testid="`save-inline-link-${link.id}`" :title="t('links.saveInline')" @click="saveInlineEdit(link)"><Save :size="16" /></button>
                    <button class="icon-button secondary" :title="t('links.cancelInline')" @click="cancelInlineEdit"><X :size="16" /></button>
                  </template>
                  <template v-else>
                    <button class="icon-button secondary" :data-testid="`edit-link-${link.id}`" :title="t('links.editInline')" @click="startInlineEdit(link)"><Pencil :size="16" /></button>
                    <a class="icon-button success" :href="link.url" :title="t('links.open')" target="_blank" rel="noreferrer"><Eye :size="16" /></a>
                    <button class="icon-button danger" :data-testid="`delete-link-${link.id}`" :title="t('common.delete')" :disabled="deletingIds.has(link.id)" @click="remove(link)"><Trash2 :size="16" /></button>
                  </template>
                </template>
              </span>
            </article>
          </SortableList>
          <article v-if="isCreatingLink && !sortMode" class="admin-table-row inline-create-link-row">
            <span></span>
            <span class="sort-cell"><Plus :size="17" /></span>
            <span :data-label="t('links.name')"><input v-model="form.name" class="inline-link-input" data-testid="new-link-name" maxlength="24" :aria-label="t('links.newName')" /></span>
            <span class="url-cell" :data-label="t('links.url')"><input v-model="form.url" class="inline-link-input" data-testid="new-link-url" type="url" :aria-label="t('links.newUrl')" /></span>
            <span :data-label="t('links.folder')">
              <select v-model.number="form.folderId" class="inline-link-select" data-testid="new-link-folder" :aria-label="t('links.newFolder')">
                <option v-for="folder in formCategoryFolders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
              </select>
            </span>
            <span data-label="notab">
              <select v-model.number="formCategoryId" class="inline-link-select" data-testid="new-link-category" :aria-label="t('links.newNotab')">
                <option v-for="category in categoryFolders" :key="category.id" :value="category.id">{{ category.name }}</option>
              </select>
            </span>
            <span class="link-health-cell status-unchecked" :data-label="t('links.status')"><span class="link-health-value"><i aria-hidden="true"></i>{{ t('links.unchecked') }}</span></span>
            <span class="row-actions" :data-label="t('links.actions')">
              <button class="icon-button success" data-testid="save-new-link" type="button" :title="t('links.saveLink')" :disabled="isSaving" @click="save"><Save :size="16" /></button>
              <button class="icon-button secondary" type="button" :title="t('common.cancel')" @click="reset"><X :size="16" /></button>
            </span>
          </article>
          <button v-else-if="!sortMode" id="new-bookmark" class="add-list-row" data-testid="add-link-row" type="button" :title="t('links.addLink')" @click="startCreateLink"><Plus :size="18" /></button>
        </div>
        <div v-if="sortMode" class="sort-footer sticky-sort-footer">
          <strong>{{ activeFolder?.name || t('links.noFolderSelected') }} · {{ t('links.countSuffix', { count: filteredLinks.length }) }}<span v-if="sortMode">{{ t('links.unsavedSuffix') }}</span></strong>
          <div class="toolbar">
            <button class="button secondary" type="button" @click="stopSorting"><X :size="17" /> {{ t('links.exitSort') }}</button>
            <button class="button" data-testid="save-link-sort" type="button" :disabled="isSavingSort" @click="saveSorting"><Save :size="17" /> {{ isSavingSort ? t('common.saving') : t('links.saveChanges') }}</button>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.folder-pill-sort-area {
  align-items: center;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 2px;
}

.sortable-folder-pills {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.sortable-folder-pill {
  align-items: center;
  display: inline-flex;
  gap: 5px;
  user-select: none;
}

.nested-folder-pill {
  opacity: 0.84;
}

.folder-pill-grip {
  margin-left: -5px;
  opacity: 0.42;
}

.sortable-folder-pill:hover .folder-pill-grip,
.sortable-folder-pill:focus-visible .folder-pill-grip,
.sortable-folder-pill.active .folder-pill-grip {
  opacity: 0.8;
}

.sortable-folder-pill-ghost {
  opacity: 0.35;
}

.folder-management-panel {
  border-block: 1px solid var(--admin-border);
  display: grid;
  gap: 12px;
  padding: 14px 0;
}

.folder-management-head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.folder-management-head > div {
  display: grid;
  gap: 2px;
}

.folder-management-head span {
  color: var(--admin-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.folder-management-head strong {
  font-size: 14px;
}

.folder-summary-table {
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-surface-radius, 8px);
  min-width: 0;
  overflow-x: auto;
}

.folder-summary-head,
.folder-summary-row {
  align-items: center;
  display: grid;
  grid-template-columns: 58px minmax(180px, 1fr) minmax(100px, 0.6fr) 120px minmax(220px, 1.4fr) 104px;
  min-width: 820px;
}

.folder-summary-head {
  background: var(--admin-surface-sunken);
  border-bottom: 1px solid var(--admin-border);
  color: var(--admin-text-muted);
  font-size: 11.5px;
  font-weight: 600;
}

.folder-summary-head > *,
.folder-summary-row > * {
  min-width: 0;
  padding: 10px 12px;
}

.folder-summary-name {
  padding-left: 18px;
  text-align: left;
}

.folder-summary-row {
  min-height: 52px;
}

.folder-summary-row > span,
.folder-summary-row > strong {
  font-size: 13px;
}

.folder-summary-description {
  color: var(--admin-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-notab-link {
  min-height: var(--ui-control-h-sm);
  padding-inline: 9px;
}

.folder-editor-form {
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(110px, 0.7fr) minmax(180px, 1.2fr) minmax(150px, 0.9fr) minmax(160px, 1fr);
  min-width: 0;
}

.folder-editor-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.folder-editor-field > span {
  color: var(--admin-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.folder-editor-field input,
.folder-editor-field select,
.folder-editor-field textarea {
  background: var(--admin-surface-elevated);
  border: 1px solid var(--admin-border-strong);
  border-radius: 8px;
  color: var(--text);
  font: inherit;
  min-height: 38px;
  min-width: 0;
  padding: 8px 12px;
  width: 100%;
}

.folder-editor-field input:focus,
.folder-editor-field select:focus,
.folder-editor-field textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.12);
  outline: none;
}

.folder-editor-description {
  grid-column: 1 / -1;
}

.folder-editor-description textarea {
  min-height: 68px;
  resize: vertical;
}

.folder-editor-actions {
  display: flex;
  gap: 8px;
  grid-column: 1 / -1;
  justify-content: flex-end;
}

.bulk-action-bar {
  display: grid;
  gap: 12px;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.bulk-list-tools {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.bulk-list-tools .admin-search-input {
  flex: 1 1 240px;
  max-width: 320px;
  min-width: 180px;
}

.link-health-cell {
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.link-health-value {
  align-items: center;
  display: inline-flex;
  gap: 7px;
}

.link-health-cell i {
  background: var(--admin-status-neutral-dot);
  border-radius: 50%;
  flex: 0 0 7px;
  height: 7px;
  width: 7px;
}

.link-health-cell.status-ok { color: var(--admin-status-ok); }
.link-health-cell.status-ok i { background: var(--admin-status-ok-dot); }
.link-health-cell.status-redirected { color: var(--admin-status-warn); }
.link-health-cell.status-redirected i { background: var(--admin-status-warn-dot); }
.link-health-cell.status-restricted { color: var(--admin-status-warn); }
.link-health-cell.status-restricted i { background: var(--admin-status-warn-dot); }
.link-health-cell.status-broken,
.link-health-cell.status-invalid { color: var(--admin-status-danger); }
.link-health-cell.status-broken i,
.link-health-cell.status-invalid i { background: var(--admin-status-danger-dot); }
.link-health-cell.status-timeout { color: var(--admin-status-alt); }
.link-health-cell.status-timeout i { background: var(--admin-status-alt-dot); }

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

.inline-create-link-row {
  border-top: 1px solid var(--admin-border);
}

@media (max-width: 1280px) {
  .bulk-action-bar {
    grid-template-columns: 1fr;
  }

  .bulk-list-tools {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .bulk-list-tools .admin-search-input {
    max-width: none;
  }

  .folder-editor-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .bulk-list-tools,
  .bulk-list-tools .button,
  .bulk-list-tools .admin-search-input {
    width: 100%;
  }

  .folder-management-head {
    align-items: stretch;
    flex-direction: column;
  }

  .folder-management-head .button {
    width: 100%;
  }

  .folder-summary-table {
    border: 0;
    overflow: visible;
  }

  .folder-summary-head {
    display: none;
  }

  .folder-summary-row {
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-surface-radius, 8px);
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    min-width: 0;
    padding: 10px;
  }

  .folder-summary-row > * {
    padding: 6px 8px;
  }

  .folder-summary-row > :nth-child(3),
  .folder-summary-row > :nth-child(4),
  .folder-summary-row > :nth-child(5) {
    grid-column: 2 / -1;
  }

  .folder-summary-row > .row-actions {
    grid-column: 3;
    grid-row: 1 / 3;
  }

  .folder-summary-name {
    padding-left: 8px;
  }

  .folder-editor-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .folder-editor-description,
  .folder-editor-actions {
    grid-column: auto;
  }

  .folder-editor-actions .button {
    flex: 1 1 0;
  }
}

.management-filter-group {
  align-items: flex-start;
  border-bottom: 1px solid var(--admin-border);
  display: grid;
  gap: 12px;
  grid-template-columns: 54px minmax(0, 1fr);
  padding: 11px 0;
}

.management-filter-group + .management-filter-group {
  margin-bottom: 10px;
}

.management-filter-label {
  color: var(--admin-text-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 34px;
}

.management-filter-group .folder-pills {
  margin: 0;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
}

.management-filter-group .folder-pill {
  flex: 0 0 auto;
}

.inline-link-input,
.inline-link-select {
  background: var(--admin-surface-elevated);
  border: 1px solid var(--admin-border-strong);
  border-radius: 7px;
  color: var(--text);
  font: inherit;
  min-height: 34px;
  min-width: 0;
  padding: 6px 9px;
  width: 100%;
}

.inline-link-input:focus,
.inline-link-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.12);
  outline: none;
}

@media (max-width: 720px) {
  .management-filter-group {
    gap: 4px;
    grid-template-columns: 1fr;
  }

  .management-filter-label {
    line-height: 1.4;
  }

  .inline-link-input,
  .inline-link-select {
    width: 100%;
  }
}
</style>
