<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Eye, Link2, MoveDown, MoveUp, Plus, Save, Trash2, X } from 'lucide-vue-next';
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
const selectedFolderId = ref<number>(0);
const sortMode = ref(false);
const draftLinks = ref<Link[]>([]);
const form = reactive({ id: 0, folderId: 0, name: '', url: '', icon: '', description: '' });
const error = ref('');
const message = ref('');
const isInitialLoading = ref(true);
const isSaving = ref(false);
const isSavingSort = ref(false);
const deletingIds = ref(new Set<number>());
const searchTerm = ref('');

const activeFolder = computed(() => folders.value.find((folder) => folder.id === selectedFolderId.value) || folders.value[0]);
const activeFolderLinks = computed(() => links.value.filter((link) => link.folderId === activeFolder.value?.id).sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));
const filteredLinks = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  const base = sortMode.value ? draftLinks.value : activeFolderLinks.value;
  if (!query) return base;
  return base.filter((link) => [link.name, link.url, link.description || ''].join(' ').toLowerCase().includes(query));
});

async function load() {
  isInitialLoading.value = true;
  try {
    [folders.value, links.value] = await Promise.all([apiRequest<Folder[]>('/api/admin/folders'), apiRequest<Link[]>('/api/admin/links')]);
    if (!selectedFolderId.value && folders.value[0]) selectedFolderId.value = folders.value[0].id;
    if (!form.folderId && folders.value[0]) form.folderId = folders.value[0].id;
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

function startSorting() {
  draftLinks.value = activeFolderLinks.value.map((link) => ({ ...link }));
  sortMode.value = true;
}

function stopSorting() {
  sortMode.value = false;
  draftLinks.value = [];
}

function moveDraft(link: Link, direction: -1 | 1) {
  const index = draftLinks.value.findIndex((item) => item.id === link.id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= draftLinks.value.length) return;
  [draftLinks.value[index], draftLinks.value[next]] = [draftLinks.value[next], draftLinks.value[index]];
}

async function saveSorting() {
  isSavingSort.value = true;
  try {
    await apiRequest('/api/admin/links/reorder', { method: 'PUT', body: jsonBody({ ids: draftLinks.value.map((link) => link.id) }) });
    const orderMap = new Map(draftLinks.value.map((link, index) => [link.id, (draftLinks.value.length - index) * 10]));
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
        <input data-testid="link-search" v-model="searchTerm" class="admin-search-input" placeholder="搜索名称、链接或介绍" />
      </div>
      <LoadingOverlay v-if="isInitialLoading" label="正在加载书签" />
      <template v-else>
        <div class="folder-pills">
          <button v-for="folder in folders" :key="folder.id" class="folder-pill" :class="{ active: folder.id === activeFolder?.id }" type="button" @click="selectFolder(folder)">
            <span>{{ folder.icon || '□' }}</span>{{ folder.name }}
          </button>
        </div>
        <EmptyState v-if="!filteredLinks.length" title="没有匹配的书签" description="换一个关键词或选择其他文件夹。" />
        <div v-else class="admin-table bookmark-table mobile-card-table">
          <div class="admin-table-head">
            <span></span>
            <span>名称</span>
            <span>链接</span>
            <span>文件夹</span>
            <span>操作</span>
          </div>
          <article v-for="(link, index) in filteredLinks" :key="link.id" class="admin-table-row">
            <span class="sort-cell">
              <template v-if="sortMode">
                <button class="icon-button secondary" title="上移" :disabled="index === 0" @click="moveDraft(link, -1)"><MoveUp :size="16" /></button>
                <button class="icon-button secondary" title="下移" :disabled="index === filteredLinks.length - 1" @click="moveDraft(link, 1)"><MoveDown :size="16" /></button>
              </template>
              <Link2 v-else :size="16" />
            </span>
            <button class="text-button" type="button" @click="edit(link)">{{ link.name }}</button>
            <span class="url-cell">{{ link.url }}</span>
            <span>{{ folders.find((folder) => folder.id === link.folderId)?.name || '-' }}</span>
            <span class="row-actions">
              <a class="icon-button success" :href="link.url" title="打开" target="_blank" rel="noreferrer"><Eye :size="16" /></a>
              <button class="icon-button danger" :data-testid="`delete-link-${link.id}`" title="删除" :disabled="deletingIds.has(link.id)" @click="remove(link)"><Trash2 :size="16" /></button>
            </span>
          </article>
        </div>
        <div class="sort-footer">
          <strong>{{ activeFolder?.name || '未选择文件夹' }} · {{ filteredLinks.length }} 个书签</strong>
          <div class="toolbar">
            <button v-if="!sortMode" class="button secondary" type="button" :disabled="!activeFolderLinks.length" @click="startSorting"><MoveUp :size="17" /> 调整顺序</button>
            <button v-if="sortMode" class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 退出排序</button>
            <button v-if="sortMode" class="button" type="button" :disabled="isSavingSort" @click="saveSorting"><Save :size="17" /> {{ isSavingSort ? '保存中' : '保存变更' }}</button>
          </div>
        </div>
      </template>
    </section>
  </AdminLayout>
</template>
