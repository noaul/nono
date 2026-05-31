<script setup lang="ts">
import { ref } from 'vue';
import { Download, Upload } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';

const html = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const fileName = ref('');
const message = ref('');
const error = ref('');

function openFilePicker() {
  fileInput.value?.click();
}

async function pickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = '';
  message.value = '';
  fileName.value = file.name;
  html.value = await file.text();
  (event.target as HTMLInputElement).value = '';
}

async function importBookmarks() {
  error.value = '';
  message.value = '';
  if (!html.value.trim()) {
    error.value = '请先选择或粘贴浏览器书签 HTML。';
    return;
  }
  try {
    const result = await apiRequest<{ addedFolders: number; addedLinks: number; skippedDuplicates: number }>('/api/admin/bookmarks/import', {
      method: 'POST',
      body: jsonBody({ html: html.value }),
    });
    message.value = `导入 ${result.addedFolders} 个文件夹、${result.addedLinks} 个链接，跳过 ${result.skippedDuplicates} 个重复链接。`;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '导入失败';
  }
}

function exportBookmarks() {
  window.location.href = '/api/admin/bookmarks/export';
}
</script>

<template>
  <AdminLayout title="浏览器书签">
    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>书签导入导出</h2>
          <p>支持 Chrome、Edge、Firefox 等浏览器导出的 Netscape Bookmark HTML。</p>
        </div>
        <div class="toolbar">
          <button class="button secondary" type="button" @click="openFilePicker"><Upload :size="17" /> 选择 HTML</button>
          <button class="button" type="button" @click="importBookmarks"><Upload :size="17" /> 导入</button>
          <button class="button secondary" type="button" @click="exportBookmarks"><Download :size="17" /> 导出</button>
        </div>
      </div>
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <input ref="fileInput" type="file" accept=".html,.htm,text/html" hidden @change="pickFile" />
      <p class="row-subtitle">{{ fileName ? `已选择：${fileName}` : '还没有选择文件，也可以直接把书签 HTML 粘贴到下方。' }}</p>
      <div class="field">
        <label>Netscape Bookmark HTML</label>
        <textarea v-model="html" placeholder="也可以直接粘贴浏览器导出的书签 HTML" />
      </div>
    </section>
  </AdminLayout>
</template>
