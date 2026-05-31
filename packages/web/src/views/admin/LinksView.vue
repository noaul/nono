<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ExternalLink, Plus, Save, Trash2 } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link } from '@/api/types';

const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);
const filterFolder = ref<number | ''>('');
const form = reactive({ id: 0, folderId: 0, name: '', url: '', icon: '', description: '' });
const error = ref('');
const message = ref('');
const shownLinks = computed(() => (filterFolder.value ? links.value.filter((link) => link.folderId === Number(filterFolder.value)) : links.value));

async function load() {
  [folders.value, links.value] = await Promise.all([apiRequest<Folder[]>('/api/admin/folders'), apiRequest<Link[]>('/api/admin/links')]);
  if (!form.folderId && folders.value[0]) form.folderId = folders.value[0].id;
}

function edit(link: Link) {
  Object.assign(form, link);
}

function reset() {
  Object.assign(form, { id: 0, folderId: folders.value[0]?.id || 0, name: '', url: '', icon: '', description: '' });
}

async function save() {
  error.value = '';
  try {
    if (form.id) await apiRequest<Link>(`/api/admin/links/${form.id}`, { method: 'PUT', body: jsonBody(form) });
    else await apiRequest<Link>('/api/admin/links', { method: 'POST', body: jsonBody(form) });
    message.value = '已保存';
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

onMounted(load);
</script>

<template>
  <AdminLayout title="链接">
    <div class="grid two">
      <form class="panel grid" @submit.prevent="save">
        <p v-if="message" class="notice">{{ message }}</p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="field"><label>文件夹</label><select v-model.number="form.folderId" required><option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.name }}</option></select></div>
        <div class="field"><label>名称</label><input v-model="form.name" required /></div>
        <div class="field"><label>URL</label><input v-model="form.url" required /></div>
        <div class="field"><label>图标</label><input v-model="form.icon" /></div>
        <div class="field"><label>描述</label><textarea v-model="form.description" /></div>
        <div class="toolbar">
          <button class="button" type="submit"><Save :size="17" /> 保存</button>
          <button class="button secondary" type="button" @click="reset"><Plus :size="17" /> 新建</button>
        </div>
      </form>
      <section class="panel list">
        <div class="field"><label>过滤文件夹</label><select v-model="filterFolder"><option value="">全部</option><option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.name }}</option></select></div>
        <article v-for="link in shownLinks" :key="link.id" class="row">
          <button class="button secondary" type="button" @click="edit(link)">
            <span>{{ link.name }}</span>
          </button>
          <div class="toolbar">
            <a class="icon-button secondary" :href="link.url" title="打开" target="_blank" rel="noreferrer"><ExternalLink :size="17" /></a>
            <button class="icon-button danger" title="删除" @click="remove(link)"><Trash2 :size="17" /></button>
          </div>
        </article>
      </section>
    </div>
  </AdminLayout>
</template>
