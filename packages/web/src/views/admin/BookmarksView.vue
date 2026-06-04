<script setup lang="ts">
import { ref, watch } from 'vue';
import { Download, Eye, Upload } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { BookmarkImportPreview } from '@/api/types';

const html = ref('');
const fileName = ref('');
const message = ref('');
const error = ref('');
const preview = ref<BookmarkImportPreview | null>(null);
const isPreviewing = ref(false);
const isImporting = ref(false);

async function pickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = '';
  message.value = '';
  preview.value = null;
  fileName.value = file.name;
  html.value = await file.text();
  (event.target as HTMLInputElement).value = '';
}

async function previewBookmarks() {
  error.value = '';
  message.value = '';
  if (!html.value.trim()) {
    error.value = '请先选择或粘贴浏览器书签 HTML。';
    return;
  }
  isPreviewing.value = true;
  try {
    preview.value = await apiRequest<BookmarkImportPreview>('/api/admin/bookmarks/preview', {
      method: 'POST',
      body: jsonBody({ html: html.value }),
    });
    message.value = `预览完成：解析 ${preview.value.summary.parsedFolders} 个文件夹、${preview.value.summary.parsedLinks} 个链接。`;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '预览失败';
  } finally {
    isPreviewing.value = false;
  }
}

async function importBookmarks() {
  error.value = '';
  message.value = '';
  if (!html.value.trim()) {
    error.value = '请先选择或粘贴浏览器书签 HTML。';
    return;
  }
  if (!preview.value) {
    error.value = '请先预览导入内容。';
    return;
  }
  isImporting.value = true;
  try {
    const result = await apiRequest<{ addedFolders: number; addedLinks: number; skippedDuplicates: number; skippedInvalid?: number }>('/api/admin/bookmarks/import', {
      method: 'POST',
      body: jsonBody({ html: html.value }),
    });
    const skippedInvalid = result.skippedInvalid || 0;
    message.value = `导入 ${result.addedFolders} 个文件夹、${result.addedLinks} 个链接，跳过 ${result.skippedDuplicates} 个重复链接、${skippedInvalid} 个不可导入链接。`;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '导入失败';
  } finally {
    isImporting.value = false;
  }
}

function exportBookmarks() {
  window.location.href = '/api/admin/bookmarks/export';
}

watch(html, () => {
  preview.value = null;
});
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
          <button class="button secondary" data-testid="preview-bookmarks" type="button" :disabled="isPreviewing" @click="previewBookmarks">
            <Eye :size="17" /> {{ isPreviewing ? '预览中' : '预览' }}
          </button>
          <button class="button" data-testid="confirm-import" type="button" :disabled="!preview || isImporting" @click="importBookmarks">
            <Upload :size="17" /> {{ isImporting ? '导入中' : '确认导入' }}
          </button>
          <button class="button secondary" type="button" @click="exportBookmarks"><Download :size="17" /> 导出</button>
        </div>
      </div>
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field">
        <label for="bookmark-html-file">选择 HTML</label>
        <input id="bookmark-html-file" class="native-file-input" type="file" accept=".html,.htm,text/html" aria-label="选择 HTML" @change="pickFile" />
      </div>
      <p class="row-subtitle">{{ fileName ? `已选择：${fileName}` : '还没有选择文件，也可以直接把书签 HTML 粘贴到下方。' }}</p>
      <div class="field">
        <label>Netscape Bookmark HTML</label>
        <textarea v-model="html" placeholder="也可以直接粘贴浏览器导出的书签 HTML" />
      </div>
      <div v-if="preview" class="import-preview-panel">
        <div class="import-preview-head">
          <h3>预览结果</h3>
          <span>{{ preview.summary.parsedFolders }} 个文件夹 · {{ preview.summary.parsedLinks }} 个链接</span>
        </div>
        <div class="preview-stats">
          <span>新增文件夹 {{ preview.summary.newFolders }}</span>
          <span>新增链接 {{ preview.summary.newLinks }}</span>
          <span>重复链接 {{ preview.summary.duplicateLinks }}</span>
          <span>不可导入 {{ preview.summary.invalidLinks }}</span>
        </div>
        <div class="preview-list">
          <div v-for="link in preview.links" :key="`${link.status}-${link.url}-${link.name}`" class="preview-row" :class="`status-${link.status}`">
            <strong>{{ link.name }}</strong>
            <span>{{ link.url }}</span>
            <small>{{ link.status === 'new' ? '新增' : link.status === 'duplicate' ? '重复' : '不可导入' }}{{ link.reason ? `：${link.reason}` : '' }}</small>
          </div>
        </div>
      </div>
    </section>
  </AdminLayout>
</template>

<style scoped>
.native-file-input {
  cursor: pointer;
  padding: 8px;
}

.native-file-input::file-selector-button {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: #334155;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  margin-right: 12px;
  min-height: 34px;
  padding: 0 12px;
}
</style>
