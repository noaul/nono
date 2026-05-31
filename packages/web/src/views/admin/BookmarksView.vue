<script setup lang="ts">
import { ref } from 'vue';
import { Download, Upload } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';

const html = ref('');
const message = ref('');
const error = ref('');

async function pickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) html.value = await file.text();
}

async function importBookmarks() {
  error.value = '';
  message.value = '';
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
    <section class="panel grid">
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="toolbar">
        <label class="button secondary">
          <Upload :size="17" />
          选择 HTML
          <input type="file" accept=".html,text/html" hidden @change="pickFile" />
        </label>
        <button class="button" type="button" @click="importBookmarks"><Upload :size="17" /> 导入</button>
        <button class="button secondary" type="button" @click="exportBookmarks"><Download :size="17" /> 导出</button>
      </div>
      <div class="field">
        <label>Netscape Bookmark HTML</label>
        <textarea v-model="html" placeholder="也可以直接粘贴浏览器导出的书签 HTML" />
      </div>
    </section>
  </AdminLayout>
</template>
