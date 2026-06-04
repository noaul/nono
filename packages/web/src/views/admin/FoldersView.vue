<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { FolderPlus, MoveDown, MoveUp, Trash2 } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import EmptyState from '@/components/admin/EmptyState.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';

const confirmApi = useConfirm();
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);
const form = reactive({ id: 0, parentId: null as number | null, name: '', icon: '', description: '', password: '', passwordHint: '' });
const message = ref('');
const error = ref('');
const isInitialLoading = ref(true);
const isSaving = ref(false);
const movingFolderId = ref<number | null>(null);
const deletingIds = ref(new Set<number>());
const sortedFolders = computed(() => [...folders.value].sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));
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
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '加载文件夹失败');
  } finally {
    isInitialLoading.value = false;
  }
}

function folderLinkCount(folderId: number) {
  return linkCountsByFolder.value.get(folderId) || 0;
}

function edit(folder: Folder) {
  Object.assign(form, { ...folder, parentId: folder.parentId || null, password: '', passwordHint: folder.passwordHint || '' });
}

function reset() {
  Object.assign(form, { id: 0, parentId: null, name: '', icon: '', description: '', password: '', passwordHint: '' });
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
  let depth = 0;
  let parentId = folder.parentId || null;
  while (parentId) {
    const parent = folders.value.find((item) => item.id === parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parentId || null;
  }
  return depth;
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
  return folders.value.filter((folder) => folder.id !== form.id && (!form.id || !isDescendantOf(folder, form.id)));
}

async function save() {
  error.value = '';
  message.value = '';
  isSaving.value = true;
  try {
    const payload = folderPayload();
    const saved = form.id
      ? await apiRequest<Folder>(`/api/admin/folders/${form.id}`, { method: 'PUT', body: jsonBody({ ...payload, password: undefined }) })
      : await apiRequest<Folder>('/api/admin/folders', { method: 'POST', body: jsonBody(payload) });
    folders.value = form.id ? folders.value.map((folder) => (folder.id === saved.id ? saved : folder)) : [saved, ...folders.value];
    message.value = form.id ? '文件夹已更新' : '文件夹已新增';
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

async function remove(folder: Folder) {
  const linkCount = folderLinkCount(folder.id);
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
    folders.value = folders.value.filter((item) => item.id !== folder.id);
    links.value = links.value.filter((link) => link.folderId !== folder.id);
    notifySuccess('文件夹已删除');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '删除失败');
  } finally {
    const next = new Set(deletingIds.value);
    next.delete(folder.id);
    deletingIds.value = next;
  }
}

async function move(folder: Folder, direction: -1 | 1) {
  const ids = sortedFolders.value.map((item) => item.id);
  const index = ids.indexOf(folder.id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  movingFolderId.value = folder.id;
  try {
    await apiRequest('/api/admin/folders/reorder', { method: 'PUT', body: jsonBody({ ids }) });
    const orderMap = new Map(ids.map((id, orderIndex) => [id, (ids.length - orderIndex) * 10]));
    folders.value = folders.value.map((item) => ({ ...item, sortOrder: orderMap.get(item.id) || item.sortOrder }));
    notifySuccess('文件夹顺序已保存');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '排序保存失败');
  } finally {
    movingFolderId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <AdminLayout title="文件夹">
    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>{{ form.id ? '编辑文件夹' : '新增文件夹' }}</h2>
          <p>用于组织你的导航分类，可选图标、访问密码和引导语。</p>
        </div>
        <button class="button" type="button" :disabled="isSaving" @click="save">
          <FolderPlus :size="18" /> {{ isSaving ? '保存中' : form.id ? '保存文件夹' : '新增文件夹' }}
        </button>
      </div>
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <form class="admin-form-grid" @submit.prevent="save">
        <div class="field"><label>图标</label><div class="input-with-picker"><input v-model="form.icon" placeholder="如 link" /><button type="button" title="图标">☝</button></div></div>
        <div class="field"><label>名称</label><input v-model="form.name" required maxlength="16" placeholder="最多 16 个字" /></div>
        <div class="field">
          <label>上级文件夹</label>
          <select data-testid="folder-parent" v-model.number="form.parentId">
            <option :value="null">顶级文件夹</option>
            <option v-for="folder in selectableParents()" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
          </select>
        </div>
        <div class="field"><label>密码</label><input v-model="form.password" type="password" /></div>
        <div class="field"><label>引导语</label><input v-model="form.passwordHint" maxlength="30" placeholder="密码文件夹的提示语" /></div>
      </form>
    </section>

    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>文件夹管理</h2>
          <p>管理分类、访问密码、引导语和展示顺序。</p>
        </div>
        <button class="button secondary" type="button" @click="reset">清空表单</button>
      </div>
      <LoadingOverlay v-if="isInitialLoading" label="正在加载文件夹" />
      <EmptyState v-else-if="!sortedFolders.length" title="还没有文件夹" description="先创建一个文件夹，再添加导航链接。">
        <template #action>
          <button class="button" type="button" @click="reset">创建文件夹</button>
        </template>
      </EmptyState>
      <div v-else class="admin-table folder-table mobile-card-table">
        <div class="admin-table-head">
          <span>图标</span>
          <span>名称</span>
          <span>书签数</span>
          <span>引导语</span>
          <span>操作</span>
        </div>
        <article v-for="(folder, index) in sortedFolders" :key="folder.id" class="admin-table-row" :data-testid="`folder-row-${folder.id}`" :style="{ '--folder-depth': folderDepth(folder) }">
          <span data-label="图标">{{ folder.icon || '□' }}</span>
          <button class="text-button" data-label="名称" type="button" @click="edit(folder)">{{ folder.name }}</button>
          <span data-label="书签数">{{ folderLinkCount(folder.id) }} 个书签</span>
          <span data-label="引导语">{{ folder.passwordHint || folder.description || '-' }}</span>
          <span class="row-actions" data-label="操作">
            <button class="icon-button secondary" title="上移" :disabled="index === 0 || movingFolderId === folder.id" @click="move(folder, -1)"><MoveUp :size="16" /></button>
            <button class="icon-button secondary" title="下移" :disabled="index === sortedFolders.length - 1 || movingFolderId === folder.id" @click="move(folder, 1)"><MoveDown :size="16" /></button>
            <button class="icon-button danger" :data-testid="`delete-folder-${folder.id}`" title="删除" :disabled="deletingIds.has(folder.id)" @click="remove(folder)"><Trash2 :size="16" /></button>
          </span>
        </article>
      </div>
    </section>
  </AdminLayout>
</template>
