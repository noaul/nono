<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { Activity, Eye, GripVertical, Link2, MoveDown, MoveUp, Pencil, Plus, Save, Trash2, X } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import LinkDuplicatePanel from '@/components/admin/LinkDuplicatePanel.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import SortableList from '@/components/admin/SortableList.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { BulkLinkResult, DuplicateLinkGroup, Folder, Link, LinkHealthResult, LinkHealthSummary } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';

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

function healthStatusLabel(status: Link['healthStatus']) {
  if (status === 'ok') return '正常';
  if (status === 'redirected') return '重定向';
  if (status === 'restricted') return '访问受限';
  if (status === 'broken') return '异常';
  if (status === 'timeout') return '超时';
  if (status === 'invalid') return '无效';
  return '未检测';
}

function healthStatusTitle(link: Link) {
  if (!link.healthStatus) return '尚未执行健康检查';
  return [
    healthStatusLabel(link.healthStatus),
    link.healthStatusCode,
    link.healthReason,
    link.healthCheckedAt ? `检测于 ${new Date(link.healthCheckedAt).toLocaleString()}` : '',
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
const activeFolder = computed(() => selectedCategoryFolders.value.find((folder) => folder.id === selectedFolderId.value));
const activeFolderLinks = computed(() => links.value.filter((link) => link.folderId === activeFolder.value?.id).sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));
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
    notifyError(event instanceof Error ? event.message : '加载书签失败');
  } finally {
    isInitialLoading.value = false;
  }
}

function selectCategory(category: Folder) {
  selectedCategoryId.value = category.id;
  selectedFolderId.value = preferredFolderId(category.id);
  clearManagementState();
}

function selectFolder(folder: Folder) {
  selectedFolderId.value = folder.id;
  clearManagementState();
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
    notifySuccess('书签已更新');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '书签更新失败');
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
    message.value = form.id ? '书签已更新' : '书签已新增';
    notifySuccess(message.value);
    reset();
  } catch (event) {
    const text = event instanceof Error ? event.message : '保存失败';
    error.value = text;
    notifyError(text);
  } finally {
    isSaving.value = false;
  }
}

async function remove(link: Link) {
  const confirmed = await confirmApi.confirm({
    title: '删除书签',
    message: `确定删除「${link.name}」吗？这个操作会立即从公开导航页移除该链接。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  deletingIds.value = new Set([...deletingIds.value, link.id]);
  try {
    await apiRequest(`/api/admin/links/${link.id}`, { method: 'DELETE' });
    links.value = links.value.filter((item) => item.id !== link.id);
    notifySuccess('书签已删除');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '删除失败');
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
    title: '批量删除书签',
    message: `确定删除选中的 ${ids.length} 个书签吗？这个操作会立即从公开导航页移除这些链接。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  isBulkWorking.value = true;
  try {
    const result = await apiRequest<BulkLinkResult>('/api/admin/links/bulk-delete', { method: 'POST', body: jsonBody({ ids }) });
    const deletedIds = new Set(ids);
    links.value = links.value.filter((link) => !deletedIds.has(link.id));
    selectedLinkIds.value = new Set();
    notifySuccess(`已删除 ${result.deleted ?? ids.length} 个书签`);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '批量删除失败');
  } finally {
    isBulkWorking.value = false;
  }
}

async function loadDuplicates() {
  isLoadingDuplicates.value = true;
  try {
    const result = await apiRequest<{ groups: DuplicateLinkGroup[] }>('/api/admin/links/duplicates');
    duplicateGroups.value = result.groups;
    notifySuccess(result.groups.length ? `发现 ${result.groups.length} 组重复链接` : '没有发现重复链接');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '重复链接加载失败');
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
    notifySuccess(`健康检查完成：${result.summary.total} 个链接`);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '健康检查失败');
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
    message.value = '书签顺序已保存';
    notifySuccess(message.value);
    stopSorting();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '排序保存失败');
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
    <AdminPageHeader eyebrow="导航内容" title="书签管理" />

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-section compact-admin-section">
      <div class="admin-section-head">
        <h2>书签列表</h2>
      </div>
      <LoadingOverlay v-if="isInitialLoading" label="正在加载书签" />
      <template v-else>
        <div class="management-filter-group">
          <div class="management-filter-label">notab</div>
          <nav class="folder-pills" aria-label="书签 notab">
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
          <div class="management-filter-label">文件夹</div>
          <div class="folder-pills">
            <button v-for="folder in selectedCategoryFolders" :key="folder.id" class="folder-pill" :class="{ active: folder.id === activeFolder?.id }" type="button" @click="selectFolder(folder)">
              <FolderGlyph :icon="folder.icon" :size="15" />{{ folder.name }}
            </button>
          </div>
        </div>
        <div id="bookmark-tools" class="bulk-action-bar">
          <strong>{{ sortMode ? '调整书签顺序' : selectedCount ? `已选择 ${selectedCount} 个书签` : '批量操作' }}</strong>
          <div class="bulk-list-tools">
            <button v-if="!sortMode" class="button secondary" data-testid="start-link-sort" type="button" :disabled="!activeFolderLinks.length" @click="startSorting"><GripVertical :size="17" /> 调整顺序</button>
            <button v-else class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 退出排序</button>
            <button class="button secondary" data-testid="load-duplicates" type="button" :disabled="isLoadingDuplicates || sortMode" @click="loadDuplicates">
              <Link2 :size="17" /> {{ isLoadingDuplicates ? '检查中' : '查重复' }}
            </button>
            <input data-testid="link-search" v-model="searchTerm" class="admin-search-input" :disabled="sortMode" :placeholder="sortMode ? '排序时暂停搜索' : '搜索名称、链接或介绍'" />
          </div>
          <div v-if="!sortMode" class="bulk-controls">
            <button class="button secondary" data-testid="select-all-links" type="button" :disabled="!filteredLinks.length || isBulkWorking" @click="toggleAllFilteredLinks">
              {{ allFilteredSelected ? '取消全选' : '全选当前' }}
            </button>
            <button class="button secondary" data-testid="check-link-health" type="button" :disabled="isCheckingHealth || (!selectedCount && !filteredLinks.length)" @click="checkLinkHealth">
              <Activity :size="17" /> {{ isCheckingHealth ? '检查中' : '健康检查' }}
            </button>
            <button class="button danger" data-testid="bulk-delete" type="button" :disabled="!selectedCount || isBulkWorking" @click="bulkDeleteSelected">
              <Trash2 :size="17" /> 删除
            </button>
          </div>
        </div>
        <LinkDuplicatePanel :groups="duplicateGroups" :folder-name="folderName" />
        <div class="admin-table bookmark-table mobile-card-table" :class="{ 'is-sorting': sortMode }">
          <div class="admin-table-head">
            <span>选择</span>
            <span></span>
            <span>名称</span>
            <span>链接</span>
            <span>文件夹</span>
            <span>notab</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          <SortableList :disabled="!sortMode" aria-label="书签排序" @reorder="reorderDraft">
            <article v-for="(link, index) in filteredLinks" :key="link.id" class="admin-table-row sortable-admin-row" :data-testid="`link-row-${link.id}`" :data-id="link.id">
              <span class="selection-cell" data-label="选择">
                <input :data-testid="`select-link-${link.id}`" type="checkbox" :disabled="sortMode" :checked="selectedLinkIds.has(link.id)" @change="toggleLinkSelection(link.id, $event)" />
              </span>
              <span class="sort-cell" data-label="排序">
                <button v-if="sortMode" class="drag-handle" type="button" title="拖动调整顺序" aria-label="拖动调整书签顺序"><GripVertical :size="18" /></button>
                <Link2 v-else :size="16" />
              </span>
              <span data-label="名称">
                <input
                  v-if="editingLinkId === link.id"
                  v-model="inlineForm.name"
                  class="inline-link-input"
                  :data-testid="`inline-link-name-${link.id}`"
                  maxlength="24"
                />
                <span v-else :data-testid="`link-name-${link.id}`">{{ link.name }}</span>
              </span>
              <span class="url-cell" data-label="链接">
                <input
                  v-if="editingLinkId === link.id"
                  v-model="inlineForm.url"
                  class="inline-link-input"
                  :data-testid="`inline-link-url-${link.id}`"
                  type="url"
                />
                <template v-else>{{ link.url }}</template>
              </span>
              <span data-label="文件夹">
                <select
                  v-if="editingLinkId === link.id"
                  v-model.number="inlineForm.folderId"
                  class="inline-link-select"
                  :data-testid="`inline-link-folder-${link.id}`"
                  aria-label="书签文件夹"
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
                  aria-label="书签 notab"
                  @change="selectInlineCategory"
                >
                  <option v-for="category in categoryFolders" :key="category.id" :value="category.id">{{ category.name }}</option>
                </select>
                <template v-else>{{ categoryName(link.folderId) }}</template>
              </span>
              <span
                class="link-health-cell"
                :class="`status-${link.healthStatus || 'unchecked'}`"
                data-label="状态"
                :data-testid="`link-health-${link.id}`"
                :title="healthStatusTitle(link)"
              >
                <span class="link-health-value"><i aria-hidden="true"></i>{{ healthStatusLabel(link.healthStatus) }}</span>
              </span>
              <span class="row-actions" data-label="操作">
                <template v-if="sortMode">
                  <button class="icon-button secondary" title="上移" :disabled="index === 0" @click="moveDraft(link, -1)"><MoveUp :size="16" /></button>
                  <button class="icon-button secondary" title="下移" :disabled="index === filteredLinks.length - 1" @click="moveDraft(link, 1)"><MoveDown :size="16" /></button>
                </template>
                <template v-else>
                  <template v-if="editingLinkId === link.id">
                    <button class="icon-button success" :data-testid="`save-inline-link-${link.id}`" title="保存快速修改" @click="saveInlineEdit(link)"><Save :size="16" /></button>
                    <button class="icon-button secondary" title="取消快速修改" @click="cancelInlineEdit"><X :size="16" /></button>
                  </template>
                  <template v-else>
                    <button class="icon-button secondary" :data-testid="`edit-link-${link.id}`" title="快速修改名称、链接和文件夹" @click="startInlineEdit(link)"><Pencil :size="16" /></button>
                    <a class="icon-button success" :href="link.url" title="打开" target="_blank" rel="noreferrer"><Eye :size="16" /></a>
                    <button class="icon-button danger" :data-testid="`delete-link-${link.id}`" title="删除" :disabled="deletingIds.has(link.id)" @click="remove(link)"><Trash2 :size="16" /></button>
                  </template>
                </template>
              </span>
            </article>
          </SortableList>
          <article v-if="isCreatingLink && !sortMode" class="admin-table-row inline-create-link-row">
            <span></span>
            <span class="sort-cell"><Plus :size="17" /></span>
            <span data-label="名称"><input v-model="form.name" class="inline-link-input" data-testid="new-link-name" maxlength="24" aria-label="新书签名称" /></span>
            <span class="url-cell" data-label="链接"><input v-model="form.url" class="inline-link-input" data-testid="new-link-url" type="url" aria-label="新书签链接" /></span>
            <span data-label="文件夹">
              <select v-model.number="form.folderId" class="inline-link-select" data-testid="new-link-folder" aria-label="新书签文件夹">
                <option v-for="folder in formCategoryFolders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
              </select>
            </span>
            <span data-label="notab">
              <select v-model.number="formCategoryId" class="inline-link-select" data-testid="new-link-category" aria-label="新书签 notab">
                <option v-for="category in categoryFolders" :key="category.id" :value="category.id">{{ category.name }}</option>
              </select>
            </span>
            <span class="link-health-cell status-unchecked" data-label="状态"><span class="link-health-value"><i aria-hidden="true"></i>未检测</span></span>
            <span class="row-actions" data-label="操作">
              <button class="icon-button success" data-testid="save-new-link" type="button" title="保存书签" :disabled="isSaving" @click="save"><Save :size="16" /></button>
              <button class="icon-button secondary" type="button" title="取消" @click="reset"><X :size="16" /></button>
            </span>
          </article>
          <button v-else-if="!sortMode" id="new-bookmark" class="add-list-row" data-testid="add-link-row" type="button" title="新增书签" @click="startCreateLink"><Plus :size="18" /></button>
        </div>
        <div v-if="sortMode" class="sort-footer sticky-sort-footer">
          <strong>{{ activeFolder?.name || '未选择文件夹' }} · {{ filteredLinks.length }} 个书签<span v-if="sortMode"> · 更改尚未保存</span></strong>
          <div class="toolbar">
            <button class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 退出排序</button>
            <button class="button" data-testid="save-link-sort" type="button" :disabled="isSavingSort" @click="saveSorting"><Save :size="17" /> {{ isSavingSort ? '保存中' : '保存变更' }}</button>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
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
  background: #a3a3a3;
  border-radius: 50%;
  flex: 0 0 7px;
  height: 7px;
  width: 7px;
}

.link-health-cell.status-ok { color: #087f5b; }
.link-health-cell.status-ok i { background: #10a37f; }
.link-health-cell.status-redirected { color: #9a6700; }
.link-health-cell.status-redirected i { background: #d97706; }
.link-health-cell.status-restricted { color: #9a6700; }
.link-health-cell.status-restricted i { background: #d97706; }
.link-health-cell.status-broken,
.link-health-cell.status-invalid { color: #b42318; }
.link-health-cell.status-broken i,
.link-health-cell.status-invalid i { background: #d92d20; }
.link-health-cell.status-timeout { color: #7c3aed; }
.link-health-cell.status-timeout i { background: #8b5cf6; }

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

.inline-create-link-row {
  border-top: 1px solid rgba(148, 163, 184, 0.22);
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
}

@media (max-width: 720px) {
  .bulk-list-tools,
  .bulk-list-tools .button,
  .bulk-list-tools .admin-search-input {
    width: 100%;
  }
}

.management-filter-group {
  align-items: flex-start;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  display: grid;
  gap: 12px;
  grid-template-columns: 54px minmax(0, 1fr);
  padding: 11px 0;
}

.management-filter-group + .management-filter-group {
  margin-bottom: 10px;
}

.management-filter-label {
  color: #64748b;
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
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(148, 163, 184, 0.46);
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
