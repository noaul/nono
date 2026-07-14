<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { CheckSquare, FolderPlus, GripVertical, MoveDown, MoveUp, Pencil, Save, Square, Trash2, X } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import FolderGlyph from '@/components/FolderGlyph.vue';
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
const form = reactive({ id: 0, parentId: null as number | null, name: '', icon: '', description: '', password: '', passwordHint: '' });
const folderIconOptions = ['📁', '⭐', '🧰', '💻', '📚', '🎨', '🎮', '🌐', '🔒', '📌', '🧪', '🚀'];
const message = ref('');
const error = ref('');
const isInitialLoading = ref(true);
const isSaving = ref(false);
const sortMode = ref(false);
const draftFolderIds = shallowRef<number[]>([]);
const isSavingSort = ref(false);
const deletingIds = ref(new Set<number>());
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
    notifyError(event instanceof Error ? event.message : '加载文件夹失败');
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
  if (form.parentId && !visibleFolderIds.value.has(form.parentId)) form.parentId = id;
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
    title: '批量删除文件夹',
    message: `确定删除涉及的 ${affectedIds.size} 个文件夹和 ${linkCount} 个书签吗？子文件夹也会一起删除。`,
    confirmText: '删除',
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
    notifySuccess(`已删除 ${affectedIds.size} 个文件夹和 ${linkCount} 个书签`);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '批量删除失败');
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
  Object.assign(form, { id: 0, parentId: null, name: '', icon: '', description: '', password: '', passwordHint: '' });
}

function chooseIcon(icon: string) {
  form.icon = icon;
}

function chooseInlineIcon(icon: string) {
  inlineForm.icon = icon;
}

function folderPayload() {
  return {
    parentId: form.parentId,
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

function isDescendantOf(folder: Folder, parentId: number) {
  let cursor = folder.parentId || null;
  while (cursor) {
    if (cursor === parentId) return true;
    const parent = folders.value.find((item) => item.id === cursor);
    cursor = parent?.parentId || null;
  }
  return false;
}

function selectableParents() {
  // Two-level model: sub-folders attach to a category (top-level folder).
  return folders.value.filter((folder) => !folder.parentId && folder.id !== form.id && (!form.id || !isDescendantOf(folder, form.id)));
}

function inlineSelectableParents(folderId: number) {
  return categoryFolders.value.filter((folder) => folder.id !== folderId);
}

async function save() {
  error.value = '';
  message.value = '';
  isSaving.value = true;
  try {
    const payload = folderPayload();
    const saved = await apiRequest<Folder>('/api/admin/folders', { method: 'POST', body: jsonBody(payload) });
    folders.value = [saved, ...folders.value];
    if (!selectedCategoryId.value) ensureSelectedCategory();
    message.value = '文件夹已新增';
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
    notifySuccess('文件夹已更新');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '文件夹更新失败');
  } finally {
    isSavingInlineFolder.value = false;
  }
}

async function remove(folder: Folder) {
  const affectedFolderIds = folderTreeIds(folder.id);
  const linkCount = links.value.filter((link) => affectedFolderIds.has(link.folderId)).length;
  const confirmed = await confirmApi.confirm({
    title: '删除文件夹',
    message: `确定删除「${folder.name}」吗？该文件夹内的 ${linkCount} 个书签会一起删除。`,
    confirmText: '删除',
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
    notifySuccess('文件夹已删除');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '删除失败');
  } finally {
    const next = new Set(deletingIds.value);
    next.delete(folder.id);
    deletingIds.value = next;
  }
}

function startSorting() {
  clearFolderSelection();
  cancelInlineEdit();
  draftFolderIds.value = categorySortedFolders.value.map((folder) => folder.id);
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
    notifySuccess('文件夹顺序已保存');
    stopSorting();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '排序保存失败');
  } finally {
    isSavingSort.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AdminLayout title="文件夹">
    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>新增文件夹</h2>
          <p>用于组织你的导航分类，可选图标、访问密码和引导语。</p>
        </div>
        <button class="button" type="button" :disabled="isSaving" @click="save">
          <FolderPlus :size="18" /> {{ isSaving ? '保存中' : '新增文件夹' }}
        </button>
      </div>
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <form class="admin-form-grid" @submit.prevent="save">
        <div class="field folder-icon-field">
          <label>图标</label>
          <div class="folder-icon-picker" aria-label="选择文件夹图标">
            <button
              v-for="icon in folderIconOptions"
              :key="icon"
              class="folder-icon-option"
              :class="{ active: form.icon === icon }"
              type="button"
              :aria-pressed="form.icon === icon"
              @click="chooseIcon(icon)"
            >
              {{ icon }}
            </button>
          </div>
          <input class="folder-icon-custom" v-model="form.icon" maxlength="4" placeholder="也可手动输入图标" />
        </div>
        <div class="field"><label>名称</label><input v-model="form.name" required maxlength="16" placeholder="最多 16 个字" /></div>
        <div class="field">
          <label>所属大类</label>
          <select data-testid="folder-parent" v-model.number="form.parentId">
            <option :value="null">作为大类（顶级）</option>
            <option v-for="folder in selectableParents()" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
          </select>
        </div>
        <div class="field"><label>密码</label><input v-model="form.password" type="password" /></div>
        <div class="field"><label>引导语</label><input v-model="form.passwordHint" maxlength="30" placeholder="密码文件夹的提示语" /></div>
        <div class="field">
          <label>AI 归类提示</label>
          <textarea v-model="form.description" data-testid="folder-ai-prompt" maxlength="400" placeholder="例如：只收录文献管理、科研写作和 Zotero 相关网站" />
        </div>
      </form>
    </section>

    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>文件夹管理</h2>
          <p>{{ sortMode ? '拖动手柄调整顺序，完成后统一保存。' : '管理分类、AI 归类提示、访问密码和展示顺序。' }}</p>
        </div>
        <div class="toolbar">
          <span v-if="sortMode" class="sort-save-state">更改尚未保存</span>
          <button v-if="!sortMode" class="button secondary" data-testid="start-folder-sort" type="button" :disabled="!sortedFolders.length" @click="startSorting">
            <GripVertical :size="17" /> 调整顺序
          </button>
          <button v-else class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 取消</button>
          <button class="button secondary" type="button" @click="reset">清空表单</button>
        </div>
      </div>
      <LoadingOverlay v-if="isInitialLoading" label="正在加载文件夹" />
      <EmptyState v-else-if="!sortedFolders.length" title="还没有文件夹" description="先创建一个文件夹，再添加导航链接。">
        <template #action>
          <button class="button" type="button" @click="reset">创建文件夹</button>
        </template>
      </EmptyState>
      <template v-else>
        <nav class="folder-pills category-manager-tabs" aria-label="文件夹大类">
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
        <div v-if="!sortMode" class="bulk-action-bar">
          <strong>{{ selectedFolderCount ? `已选择 ${selectedFolderCount} 个文件夹` : '批量操作' }}</strong>
          <div class="bulk-controls">
            <button class="button secondary" data-testid="select-all-folders" type="button" @click="selectAllFolders"><CheckSquare :size="17" /> 全选</button>
            <button class="button secondary" type="button" :disabled="!selectedFolderCount" @click="clearFolderSelection"><Square :size="17" /> 取消选择</button>
            <button class="button danger" data-testid="bulk-delete-folders" type="button" :disabled="!selectedFolderCount || isBulkDeleting" @click="bulkDeleteSelected">
              <Trash2 :size="17" /> {{ isBulkDeleting ? '删除中' : '批量删除' }}
            </button>
          </div>
        </div>
        <div class="admin-table folder-table mobile-card-table">
        <div class="admin-table-head">
          <span>选择</span>
          <span>{{ sortMode ? '排序' : '图标' }}</span>
          <span>名称</span>
          <span>书签数</span>
          <span>AI 提示</span>
          <span>操作</span>
        </div>
        <SortableList :disabled="!sortMode" aria-label="文件夹排序" @reorder="reorderDraft">
          <article
            v-for="(folder, index) in displayedFolders"
            :key="folder.id"
            class="admin-table-row sortable-admin-row"
            :class="{ 'is-inline-editing': editingFolderId === folder.id }"
            :data-testid="`folder-row-${folder.id}`"
            :data-id="folder.id"
            :style="{ '--folder-depth': folderDepth(folder) }"
          >
            <span class="selection-cell" data-label="选择">
              <input
                :data-testid="`select-folder-${folder.id}`"
                type="checkbox"
                :disabled="sortMode"
                :checked="selectedFolderIds.has(folder.id)"
                @change="toggleFolderSelection(folder.id, $event)"
              />
            </span>
            <div v-if="editingFolderId === folder.id" class="inline-folder-editor">
              <div class="inline-folder-field inline-folder-icon-field">
                <label>图标</label>
                <div class="inline-folder-icon-picker" :data-testid="`inline-folder-icon-picker-${folder.id}`">
                  <button
                    v-for="(icon, iconIndex) in folderIconOptions"
                    :key="icon"
                    class="folder-icon-option"
                    :class="{ active: inlineForm.icon === icon }"
                    :data-testid="`inline-folder-icon-${folder.id}-${iconIndex}`"
                    type="button"
                    :aria-pressed="inlineForm.icon === icon"
                    @click="chooseInlineIcon(icon)"
                  >
                    {{ icon }}
                  </button>
                </div>
              </div>
              <div class="inline-folder-field">
                <label :for="`inline-folder-name-${folder.id}`">名称</label>
                <input :id="`inline-folder-name-${folder.id}`" v-model="inlineForm.name" :data-testid="`inline-folder-name-${folder.id}`" maxlength="16" />
              </div>
              <div class="inline-folder-field">
                <label :for="`inline-folder-parent-${folder.id}`">所属大类</label>
                <select :id="`inline-folder-parent-${folder.id}`" v-model.number="inlineForm.parentId" :data-testid="`inline-folder-parent-${folder.id}`">
                  <option :value="null">作为大类（顶级）</option>
                  <option v-for="parent in inlineSelectableParents(folder.id)" :key="parent.id" :value="parent.id">{{ parent.name }}</option>
                </select>
              </div>
              <div class="inline-folder-field">
                <label :for="`inline-folder-hint-${folder.id}`">引导语</label>
                <input :id="`inline-folder-hint-${folder.id}`" v-model="inlineForm.passwordHint" :data-testid="`inline-folder-hint-${folder.id}`" maxlength="30" />
              </div>
              <div class="inline-folder-field inline-folder-ai-prompt">
                <label :for="`inline-folder-ai-prompt-${folder.id}`">AI 归类提示</label>
                <textarea :id="`inline-folder-ai-prompt-${folder.id}`" v-model="inlineForm.description" :data-testid="`inline-folder-ai-prompt-${folder.id}`" maxlength="400" placeholder="告诉 AI 这个大类或文件夹应收录什么" />
              </div>
              <div class="inline-folder-actions">
                <span>{{ folderLinkCount(folder.id) }} 个书签</span>
                <button class="icon-button success" :data-testid="`save-inline-folder-${folder.id}`" title="保存修改" :disabled="isSavingInlineFolder" @click="saveInlineEdit(folder)"><Save :size="16" /></button>
                <button class="icon-button secondary" title="取消修改" :disabled="isSavingInlineFolder" @click="cancelInlineEdit"><X :size="16" /></button>
              </div>
            </div>
            <template v-else>
              <span class="folder-sort-cell" :data-label="sortMode ? '排序' : '图标'">
                <button v-if="sortMode" class="drag-handle" type="button" title="拖动调整顺序" aria-label="拖动调整文件夹顺序"><GripVertical :size="18" /></button>
                <FolderGlyph :icon="folder.icon" :size="18" />
              </span>
              <button class="text-button" data-label="名称" type="button" :disabled="sortMode" @click="startInlineEdit(folder)">{{ folder.name }}</button>
              <span data-label="书签数">{{ folderLinkCount(folder.id) }} 个书签</span>
              <span data-label="AI 提示">{{ folder.description || '-' }}</span>
              <span class="row-actions" data-label="操作">
                <template v-if="sortMode">
                  <button class="icon-button secondary" title="上移" :disabled="index === 0" @click="moveDraft(folder, -1)"><MoveUp :size="16" /></button>
                  <button class="icon-button secondary" title="下移" :disabled="index === displayedFolders.length - 1" @click="moveDraft(folder, 1)"><MoveDown :size="16" /></button>
                </template>
                <template v-else>
                  <button class="icon-button secondary" :data-testid="`edit-folder-${folder.id}`" title="重命名和更改图标" @click="startInlineEdit(folder)"><Pencil :size="16" /></button>
                  <button class="icon-button danger" :data-testid="`delete-folder-${folder.id}`" title="删除" :disabled="deletingIds.has(folder.id)" @click="remove(folder)"><Trash2 :size="16" /></button>
                </template>
              </span>
            </template>
          </article>
        </SortableList>
        </div>
      </template>
      <div v-if="sortMode" class="sort-footer sticky-sort-footer">
        <strong>{{ displayedFolders.length }} 个文件夹 · 拖动期间不会发起网络请求</strong>
        <div class="toolbar">
          <button class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 取消</button>
          <button class="button" data-testid="save-folder-sort" type="button" :disabled="isSavingSort" @click="saveSorting"><Save :size="17" /> {{ isSavingSort ? '保存中' : '保存变更' }}</button>
        </div>
      </div>
    </section>
  </AdminLayout>
</template>

<style scoped>
.folder-icon-field {
  gap: 8px;
}

.folder-icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.folder-icon-option {
  align-items: center;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 8px;
  color: #0f172a;
  cursor: pointer;
  display: inline-flex;
  font-size: 18px;
  height: 36px;
  justify-content: center;
  padding: 0;
  transition:
    background-color 0.24s ease,
    border-color 0.24s ease,
    box-shadow 0.24s ease,
    transform 0.24s ease;
  width: 36px;
}

.folder-icon-option:hover,
.folder-icon-option:focus-visible,
.folder-icon-option.active {
  background: rgba(var(--accent-rgb), 0.12);
  border-color: rgba(var(--accent-rgb), 0.42);
  box-shadow: 0 8px 18px rgba(var(--accent-rgb), 0.12);
  outline: none;
  transform: translateY(-1px);
}

.folder-icon-option:active {
  transform: translateY(0) scale(0.95);
}

.folder-icon-custom {
  margin-top: 2px;
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
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.inline-folder-field input,
.inline-folder-field select,
.inline-folder-field textarea {
  background: #ffffff;
  border: 1px solid #aeb9c6;
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

.inline-folder-icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 78px;
  overflow-y: auto;
}

.inline-folder-icon-picker .folder-icon-option {
  height: 34px;
  width: 34px;
}

.inline-folder-actions {
  align-items: center;
  display: flex;
  gap: 7px;
  min-height: 38px;
  white-space: nowrap;
}

.inline-folder-actions > span {
  color: #64748b;
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
