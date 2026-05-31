<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Eye, Link2, MoveDown, MoveUp, Plus, Save, Trash2, X } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link } from '@/api/types';

const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);
const selectedFolderId = ref<number>(0);
const sortMode = ref(false);
const draftLinks = ref<Link[]>([]);
const form = reactive({ id: 0, folderId: 0, name: '', url: '', icon: '', description: '' });
const error = ref('');
const message = ref('');

const activeFolder = computed(() => folders.value.find((folder) => folder.id === selectedFolderId.value) || folders.value[0]);
const shownLinks = computed(() => {
  if (sortMode.value) return draftLinks.value;
  return links.value.filter((link) => link.folderId === activeFolder.value?.id).sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id);
});

async function load() {
  [folders.value, links.value] = await Promise.all([apiRequest<Folder[]>('/api/admin/folders'), apiRequest<Link[]>('/api/admin/links')]);
  if (!selectedFolderId.value && folders.value[0]) selectedFolderId.value = folders.value[0].id;
  if (!form.folderId && folders.value[0]) form.folderId = folders.value[0].id;
}

function selectFolder(folder: Folder) {
  selectedFolderId.value = folder.id;
  form.folderId = folder.id;
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
  try {
    if (form.id) await apiRequest<Link>(`/api/admin/links/${form.id}`, { method: 'PUT', body: jsonBody(form) });
    else await apiRequest<Link>('/api/admin/links', { method: 'POST', body: jsonBody(form) });
    message.value = form.id ? '书签已更新' : '书签已新增';
    reset();
    await load();
  } catch (event) {
    error.value = event instanceof Error ? event.message : '保存失败';
  }
}

async function remove(link: Link) {
  await apiRequest(`/api/admin/links/${link.id}`, { method: 'DELETE' });
  await load();
}

function startSorting() {
  draftLinks.value = shownLinks.value.map((link) => ({ ...link }));
  sortMode.value = true;
}

function stopSorting() {
  sortMode.value = false;
  draftLinks.value = [];
}

function moveDraft(index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= draftLinks.value.length) return;
  [draftLinks.value[index], draftLinks.value[next]] = [draftLinks.value[next], draftLinks.value[index]];
}

async function saveSorting() {
  await apiRequest('/api/admin/links/reorder', { method: 'PUT', body: jsonBody({ ids: draftLinks.value.map((link) => link.id) }) });
  message.value = '书签顺序已保存';
  stopSorting();
  await load();
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
          <button class="button" type="button" @click="save"><Plus :size="18" /> {{ form.id ? '保存书签' : '新增书签' }}</button>
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
        <div class="field action-field"><label>操作</label><button class="button" type="submit"><Plus :size="18" /> {{ form.id ? '保存书签' : '新增书签' }}</button></div>
      </form>
    </section>

    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>书签管理</h2>
          <p>先选择文件夹，再编辑、迁移、排序或删除其中的书签。</p>
        </div>
      </div>
      <div class="folder-pills">
        <button v-for="folder in folders" :key="folder.id" class="folder-pill" :class="{ active: folder.id === activeFolder?.id }" type="button" @click="selectFolder(folder)">
          <span>{{ folder.icon || '□' }}</span>{{ folder.name }}
        </button>
      </div>
      <div class="admin-table bookmark-table">
        <div class="admin-table-head">
          <span></span>
          <span>名称</span>
          <span>链接</span>
          <span>文件夹</span>
          <span>操作</span>
        </div>
        <article v-for="(link, index) in shownLinks" :key="link.id" class="admin-table-row">
          <span class="sort-cell">
            <template v-if="sortMode">
              <button class="icon-button secondary" title="上移" :disabled="index === 0" @click="moveDraft(index, -1)"><MoveUp :size="16" /></button>
              <button class="icon-button secondary" title="下移" :disabled="index === shownLinks.length - 1" @click="moveDraft(index, 1)"><MoveDown :size="16" /></button>
            </template>
            <Link2 v-else :size="16" />
          </span>
          <button class="text-button" type="button" @click="edit(link)">{{ link.name }}</button>
          <span class="url-cell">{{ link.url }}</span>
          <span>{{ folders.find((folder) => folder.id === link.folderId)?.name || '-' }}</span>
          <span class="row-actions">
            <a class="icon-button success" :href="link.url" title="打开" target="_blank" rel="noreferrer"><Eye :size="16" /></a>
            <button class="icon-button danger" title="删除" @click="remove(link)"><Trash2 :size="16" /></button>
          </span>
        </article>
      </div>
      <div class="sort-footer">
        <strong>{{ activeFolder?.name || '未选择文件夹' }} · {{ shownLinks.length }} 个书签</strong>
        <div class="toolbar">
          <button v-if="!sortMode" class="button secondary" type="button" @click="startSorting"><MoveUp :size="17" /> 调整顺序</button>
          <button v-if="sortMode" class="button secondary" type="button" @click="stopSorting"><X :size="17" /> 退出排序</button>
          <button v-if="sortMode" class="button" type="button" @click="saveSorting"><Save :size="17" /> 保存变更</button>
        </div>
      </div>
    </section>
  </AdminLayout>
</template>
