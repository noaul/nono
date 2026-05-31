<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { FolderPlus, MoveDown, MoveUp, Trash2 } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder } from '@/api/types';

const folders = ref<Folder[]>([]);
const form = reactive({ id: 0, parentId: null as number | null, name: '', icon: '', description: '', password: '', passwordHint: '' });
const message = ref('');
const error = ref('');
const sortedFolders = computed(() => [...folders.value].sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));

async function load() {
  folders.value = await apiRequest<Folder[]>('/api/admin/folders');
}

function edit(folder: Folder) {
  Object.assign(form, { ...folder, password: '', passwordHint: folder.passwordHint || '' });
}

function reset() {
  Object.assign(form, { id: 0, parentId: null, name: '', icon: '', description: '', password: '', passwordHint: '' });
}

async function save() {
  error.value = '';
  message.value = '';
  try {
    if (form.id) await apiRequest<Folder>(`/api/admin/folders/${form.id}`, { method: 'PUT', body: jsonBody(form) });
    else await apiRequest<Folder>('/api/admin/folders', { method: 'POST', body: jsonBody(form) });
    message.value = form.id ? '文件夹已更新' : '文件夹已新增';
    reset();
    await load();
  } catch (event) {
    error.value = event instanceof Error ? event.message : '保存失败';
  }
}

async function remove(folder: Folder) {
  await apiRequest(`/api/admin/folders/${folder.id}`, { method: 'DELETE' });
  await load();
}

async function move(folder: Folder, direction: -1 | 1) {
  const ids = sortedFolders.value.map((item) => item.id);
  const index = ids.indexOf(folder.id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  await apiRequest('/api/admin/folders/reorder', { method: 'PUT', body: jsonBody({ ids }) });
  await load();
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
        <button class="button" type="button" @click="save"><FolderPlus :size="18" /> {{ form.id ? '保存文件夹' : '新增文件夹' }}</button>
      </div>
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <form class="admin-form-grid" @submit.prevent="save">
        <div class="field"><label>图标</label><div class="input-with-picker"><input v-model="form.icon" placeholder="如 link" /><button type="button" title="图标">☝</button></div></div>
        <div class="field"><label>名称</label><input v-model="form.name" required maxlength="16" placeholder="最多 16 个字" /></div>
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
      <div class="admin-table folder-table">
        <div class="admin-table-head">
          <span>图标</span>
          <span>名称</span>
          <span>引导语</span>
          <span>操作</span>
        </div>
        <article v-for="(folder, index) in sortedFolders" :key="folder.id" class="admin-table-row">
          <span>{{ folder.icon || '□' }}</span>
          <button class="text-button" type="button" @click="edit(folder)">{{ folder.name }}</button>
          <span>{{ folder.passwordHint || folder.description || '-' }}</span>
          <span class="row-actions">
            <button class="icon-button secondary" title="上移" :disabled="index === 0" @click="move(folder, -1)"><MoveUp :size="16" /></button>
            <button class="icon-button secondary" title="下移" :disabled="index === sortedFolders.length - 1" @click="move(folder, 1)"><MoveDown :size="16" /></button>
            <button class="icon-button danger" title="删除" @click="remove(folder)"><Trash2 :size="16" /></button>
          </span>
        </article>
      </div>
    </section>
  </AdminLayout>
</template>
