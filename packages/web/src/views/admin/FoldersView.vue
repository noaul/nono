<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Plus, Save, Trash2 } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder } from '@/api/types';

const folders = ref<Folder[]>([]);
const form = reactive({ id: 0, parentId: null as number | null, name: '', icon: 'folder', description: '', password: '', passwordHint: '' });
const message = ref('');
const error = ref('');

async function load() {
  folders.value = await apiRequest<Folder[]>('/api/admin/folders');
}

function edit(folder: Folder) {
  Object.assign(form, { ...folder, password: '', passwordHint: folder.passwordHint || '' });
}

function reset() {
  Object.assign(form, { id: 0, parentId: null, name: '', icon: 'folder', description: '', password: '', passwordHint: '' });
}

async function save() {
  error.value = '';
  const body = jsonBody(form);
  try {
    if (form.id) await apiRequest<Folder>(`/api/admin/folders/${form.id}`, { method: 'PUT', body });
    else await apiRequest<Folder>('/api/admin/folders', { method: 'POST', body });
    message.value = '已保存';
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
  const index = folders.value.findIndex((item) => item.id === folder.id);
  const target = folders.value[index + direction];
  if (!target) return;
  const ids = [...folders.value];
  [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
  await apiRequest('/api/admin/folders/reorder', { method: 'PUT', body: jsonBody({ ids: ids.map((item) => item.id) }) });
  await load();
}

onMounted(load);
</script>

<template>
  <AdminLayout title="文件夹">
    <div class="grid two">
      <form class="panel grid" @submit.prevent="save">
        <p v-if="message" class="notice">{{ message }}</p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="field"><label>名称</label><input v-model="form.name" required /></div>
        <div class="field"><label>父文件夹</label><select v-model="form.parentId"><option :value="null">顶层</option><option v-for="folder in folders.filter((item) => item.id !== form.id)" :key="folder.id" :value="folder.id">{{ folder.name }}</option></select></div>
        <div class="field"><label>图标</label><input v-model="form.icon" /></div>
        <div class="field"><label>描述</label><textarea v-model="form.description" /></div>
        <div class="field"><label>密码</label><input v-model="form.password" type="password" /></div>
        <div class="field"><label>密码提示</label><input v-model="form.passwordHint" /></div>
        <div class="toolbar">
          <button class="button" type="submit"><Save :size="17" /> 保存</button>
          <button class="button secondary" type="button" @click="reset"><Plus :size="17" /> 新建</button>
        </div>
      </form>
      <section class="panel list">
        <article v-for="folder in folders" :key="folder.id" class="row">
          <button class="button secondary" type="button" @click="edit(folder)">
            <span>{{ folder.name }}</span>
          </button>
          <div class="toolbar">
            <button class="icon-button secondary" title="上移" @click="move(folder, -1)">↑</button>
            <button class="icon-button secondary" title="下移" @click="move(folder, 1)">↓</button>
            <button class="icon-button danger" title="删除" @click="remove(folder)"><Trash2 :size="17" /></button>
          </div>
        </article>
      </section>
    </div>
  </AdminLayout>
</template>
