<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { Activity, Eye, GripVertical, Link2, MoveDown, MoveUp, Plus, Save, Trash2, X } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import FolderGlyph from '@/components/FolderGlyph.vue';
import EmptyState from '@/components/admin/EmptyState.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import SortableList from '@/components/admin/SortableList.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { BulkLinkResult, DuplicateLinkGroup, Folder, Link, LinkHealthResult, LinkHealthSummary } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';

const confirmApi = useConfirm();
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);
const selectedFolderId = ref<number>(0);
const sortMode = ref(false);
const draftLinkIds = shallowRef<number[]>([]);
const form = reactive({ id: 0, folderId: 0, name: '', url: '', icon: '', description: '' });
const error = ref('');
const message = ref('');
const isInitialLoading = ref(true);
const isSaving = ref(false);
const isSavingSort = ref(false);
const deletingIds = ref(new Set<number>());
const searchTerm = ref('');
const selectedLinkIds = ref(new Set<number>());
const bulkFolderId = ref(0);
const duplicateGroups = ref<DuplicateLinkGroup[]>([]);
const isBulkWorking = ref(false);
const isLoadingDuplicates = ref(false);
const healthResults = ref<LinkHealthResult[]>([]);
const healthSummary = ref<LinkHealthSummary | null>(null);
const isCheckingHealth = ref(false);

const activeFolder = computed(() => folders.value.find((folder) => folder.id === selectedFolderId.value) || folders.value[0]);
const activeFolderLinks = computed(() => links.value.filter((link) => link.folderId === activeFolder.value?.id).sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));
const linkById = computed(() => new Map(links.value.map((link) => [link.id, link])));
const selectedCount = computed(() => selectedLinkIds.value.size);
const filteredLinks = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  const base = sortMode.value
    ? draftLinkIds.value.map((id) => linkById.value.get(id)).filter((link): link is Link => Boolean(link))
    : activeFolderLinks.value;
  if (!query) return base;
  return base.filter((link) => [link.name, link.url, link.description || ''].join(' ').toLowerCase().includes(query));
});

async function load() {
  isInitialLoading.value = true;
  try {
    [folders.value, links.value] = await Promise.all([apiRequest<Folder[]>('/api/admin/folders'), apiRequest<Link[]>('/api/admin/links')]);
    if (!selectedFolderId.value && folders.value[0]) selectedFolderId.value = folders.value[0].id;
    if (!form.folderId && folders.value[0]) form.folderId = folders.value[0].id;
    if (!bulkFolderId.value && folders.value[0]) bulkFolderId.value = folders.value[0].id;
    selectedLinkIds.value = new Set();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '加载书签失败');
  } finally {
    isInitialLoading.value = false;
  }
}

function selectFolder(folder: Folder) {
  selectedFolderId.value = folder.id;
  form.folderId = folder.id;
  searchTerm.value = '';
  selectedLinkIds.value = new Set();
  stopSorting();
}

function edit(link: Link) {
  Object.assign(form, link);
  stopSorting();
}

function reset() {
  Object.assign(form, { id: 0, folderId: activeFolder.value?.id || folders.value[0]?.id || 0, name: '', url: '', icon: '', description: '' });
}

async function save() {
  error.value = '';
  message.value = '';
  isSaving.value = true;
  try {
    const saved = form.id
      ? await apiRequest<Link>(`/api/admin/links/${form.id}`, { method: 'PUT', body: jsonBody(form) })
      : await apiRequest<Link>('/api/admin/links', { method: 'POST', body: jsonBody(form) });
    links.value = form.id ? links.value.map((link) => (link.id === saved.id ? saved : link)) : [saved, ...links.value];
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

async function bulkMoveSelected() {
  const ids = [...selectedLinkIds.value];
  if (!ids.length || !bulkFolderId.value) return;

  isBulkWorking.value = true;
  try {
    const result = await apiRequest<BulkLinkResult>('/api/admin/links/bulk-move', { method: 'POST', body: jsonBody({ ids, folderId: bulkFolderId.value }) });
    const movedIds = new Set(ids);
    links.value = links.value.map((link) => (movedIds.has(link.id) ? { ...link, folderId: bulkFolderId.value } : link));
    selectedLinkIds.value = new Set();
    notifySuccess(`已移动 ${result.moved ?? ids.length} 个书签`);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '批量移动失败');
  } finally {
    isBulkWorking.value = false;
  }
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
    healthSummary.value = result.summary;
    healthResults.value = result.results;
    notifySuccess(`健康检查完成：${result.summary.total} 个链接`);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '健康检查失败');
  } finally {
    isCheckingHealth.value = false;
  }
}

function folderName(folderId: number) {
  return folders.value.find((folder) => folder.id === folderId)?.name || '-';
}

function healthStatusLabel(status: LinkHealthResult['status']) {
  return { ok: '正常', broken: '异常', timeout: '超时', invalid: '无效' }[status];
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

watch(activeFolder, (folder) => {
  if (folder && !form.id) form.folderId = folder.id;
});

onMounted(load);
</script>

<template>
  <AdminLayout title="书签管理">
    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>{{ form.id ? '编辑书签' : '新增书签' }}</h2>
          <p>把链接放进指定文件夹后，会立即出现在你的公开导航页。</p>
        </div>
        <div class="toolbar">
          <RouterLink class="button secondary" to="/admin/bookmarks">导入书签</RouterLink>
          <button class="button" type="button" :disabled="isSaving" @click="save">
            <Plus :size="18" /> {{ isSaving ? '保存中' : form.id ? '保存书签' : '新增书签' }}
          </button>
        </div>
      </div>
      <p class="warning-line">隐私与法律免责声明：你所添加的每一个链接都将负法律责任。</p>
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <form class="bookmark-create-grid" @submit.prevent="save">
        <div class="field"><label>名称</label><input v-model="form.name" required maxlength="24" placeholder="最多 24 个字" /></div>
        <div class="field wide"><label>链接</label><input v-model="form.url" required placeholder="请以 http 或 https 开头" /></div>
        <div class="field"><label>文件夹</label><select v-model.number="form.folderId" required><option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.name }}</option></select></div>
        <div class="field"><label>图标</label><div class="input-with-picker"><input v-model="form.icon" placeholder="可为空" /><button type="button" title="图标">☝</button></div></div>
        <div class="field wide"><label>介绍</label><input v-model="form.description" placeholder="鼠标经过时的提示语，也可用于站内搜索" /></div>
        <div class="field action-field"><label>操作</label><button class="button" type="submit" :disabled="isSaving"><Plus :size="18" /> {{ isSaving ? '保存中' : form.id ? '保存书签' : '新增书签' }}</button></div>
      </form>
    </section>

    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>书签管理</h2>
          <p>先选择文件夹，再编辑、迁移、排序或删除其中的书签。</p>
        </div>
        <div class="toolbar">
          <button class="button secondary" data-testid="load-duplicates" type="button" :disabled="isLoadingDuplicates" @click="loadDuplicates">
            <Link2 :size="17" /> {{ isLoadingDuplicates ? '检查中' : '查重复' }}
          </button>
          <input data-testid="link-search" v-model="searchTerm" class="admin-search-input" :disabled="sortMode" :placeholder="sortMode ? '排序时暂停搜索' : '搜索名称、链接或介绍'" />
        </div>
      </div>
      <LoadingOverlay v-if="isInitialLoading" label="正在加载书签" />
      <template v-else>
        <div class="folder-pills">
          <button v-for="folder in folders" :key="folder.id" class="folder-pill" :class="{ active: folder.id === activeFolder?.id }" type="button" @click="selectFolder(folder)">
            <FolderGlyph :icon="folder.icon" :size="15" />{{ folder.name }}
          </button>
        </div>
        <div v-if="!sortMode" class="bulk-action-bar">
          <strong>{{ selectedCount ? `已选择 ${selectedCount} 个书签` : '批量操作' }}</strong>
          <div class="bulk-controls">
            <select data-testid="bulk-folder" v-model.number="bulkFolderId" :disabled="isBulkWorking">
              <option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
            </select>
            <button class="button secondary" data-testid="bulk-move" type="button" :disabled="!selectedCount || isBulkWorking" @click="bulkMoveSelected">
              <MoveDown :size="17" /> 移动
            </button>
            <button class="button secondary" data-testid="check-link-health" type="button" :disabled="isCheckingHealth || (!selectedCount && !filteredLinks.length)" @click="checkLinkHealth">
              <Activity :size="17" /> {{ isCheckingHealth ? '检查中' : '健康检查' }}
            </button>
            <button class="button danger" data-testid="bulk-delete" type="button" :disabled="!selectedCount || isBulkWorking" @click="bulkDeleteSelected">
              <Trash2 :size="17" /> 删除
            </button>
          </div>
        </div>
        <div v-if="duplicateGroups.length" class="duplicate-panel">
          <div class="duplicate-panel-head">
            <h3>重复链接</h3>
            <span>{{ duplicateGroups.length }} 组</span>
          </div>
          <div v-for="group in duplicateGroups" :key="group.url" class="duplicate-group">
            <strong>{{ group.url }}</strong>
            <ul class="duplicate-list">
              <li v-for="link in group.links" :key="link.id">
                <span>{{ link.name }}</span>
                <small>{{ folderName(link.folderId) }}</small>
              </li>
            </ul>
          </div>
        </div>
        <div v-if="healthSummary" class="health-check-panel">
          <div class="health-check-head">
            <h3>健康检查</h3>
            <span>{{ healthSummary.total }} 个链接</span>
          </div>
          <div class="health-summary">
            <span>正常 {{ healthSummary.ok }}</span>
            <span>异常 {{ healthSummary.broken }}</span>
            <span>超时 {{ healthSummary.timeout }}</span>
            <span>无效 {{ healthSummary.invalid }}</span>
          </div>
          <div class="health-result-list">
            <div v-for="result in healthResults" :key="result.id" class="health-result-row" :class="`status-${result.status}`">
              <strong>{{ result.name }}</strong>
              <span>{{ result.url }}</span>
              <small>{{ healthStatusLabel(result.status) }}{{ result.statusCode ? ` · ${result.statusCode}` : '' }}{{ result.reason ? ` · ${result.reason}` : '' }}</small>
            </div>
          </div>
        </div>
        <EmptyState v-if="!filteredLinks.length" title="没有匹配的书签" description="换一个关键词或选择其他文件夹。" />
        <div v-else class="admin-table bookmark-table mobile-card-table" :class="{ 'is-sorting': sortMode }">
          <div class="admin-table-head">
            <span>选择</span>
            <span></span>
            <span>名称</span>
            <span>链接</span>
            <span>文件夹</span>
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
              <button class="text-button" data-label="名称" type="button" :disabled="sortMode" @click="edit(link)">{{ link.name }}</button>
              <span class="url-cell" data-label="链接">{{ link.url }}</span>
              <span data-label="文件夹">{{ folderName(link.folderId) }}</span>
              <span class="row-actions" data-label="操作">
                <template v-if="sortMode">
                  <button class="icon-button secondary" title="上移" :disabled="index === 0" @click="moveDraft(link, -1)"><MoveUp :size="16" /></button>
                  <button class="icon-button secondary" title="下移" :disabled="index === filteredLinks.length - 1" @click="moveDraft(link, 1)"><MoveDown :size="16" /></button>
                </template>
                <template v-else>
                  <a class="icon-button success" :href="link.url" title="打开" target="_blank" rel="noreferrer"><Eye :size="16" /></a>
                  <button class="icon-button danger" :data-testid="`delete-link-${link.id}`" title="删除" :disabled="deletingIds.has(link.id)" @click="remove(link)"><Trash2 :size="16" /></button>
                </template>
              </span>
            </article>
          </SortableList>
        </div>
        <div class="sort-footer" :class="{ 'sticky-sort-footer': sortMode }">
          <strong>{{ activeFolder?.name || '未选择文件夹' }} · {{ filteredLinks.length }} 个书签<span v-if="sortMode"> · 更改尚未保存</span></strong>
          <div class="toolbar">
            <button v-if="!sortMode" class="button secondary" data-testid="start-link-sort" type="button" :disabled="!activeFolderLinks.length" @click="startSorting"><GripVertical :size="17" /> 调整顺序</button>
            <button v-if="sortMode" class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 退出排序</button>
            <button v-if="sortMode" class="button" data-testid="save-link-sort" type="button" :disabled="isSavingSort" @click="saveSorting"><Save :size="17" /> {{ isSavingSort ? '保存中' : '保存变更' }}</button>
          </div>
        </div>
      </template>
    </section>
  </AdminLayout>
</template>
