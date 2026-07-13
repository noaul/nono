<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CheckSquare, Download, Eye, Square, Upload } from 'lucide-vue-next';
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
const selectedFolderTempIds = ref(new Set<string>());
const selectedLinkTempIds = ref(new Set<string>());
const selectedFolderCount = computed(() => selectedFolderTempIds.value.size);
const selectedLinkCount = computed(() => selectedLinkTempIds.value.size);
const hasImportSelection = computed(() => selectedFolderCount.value > 0 || selectedLinkCount.value > 0);
const folderByTempId = computed(() => new Map((preview.value?.folders || []).map((folder) => [folder.tempId, folder])));

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
    const result = await apiRequest<BookmarkImportPreview>('/api/admin/bookmarks/preview', {
      method: 'POST',
      body: jsonBody({ html: html.value }),
    });
    preview.value = result;
    selectAllImportable();
    message.value = `预览完成：解析 ${result.summary.parsedFolders} 个文件夹、${result.summary.parsedLinks} 个链接。`;
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
      body: jsonBody({
        html: html.value,
        selection: {
          folderTempIds: (preview.value?.folders || []).filter((folder) => selectedFolderTempIds.value.has(folder.tempId)).map((folder) => folder.tempId),
          linkTempIds: (preview.value?.links || []).filter((link) => selectedLinkTempIds.value.has(link.tempId)).map((link) => link.tempId),
        },
      }),
    });
    const skippedInvalid = result.skippedInvalid || 0;
    message.value = `导入 ${result.addedFolders} 个文件夹、${result.addedLinks} 个链接，跳过 ${result.skippedDuplicates} 个重复链接、${skippedInvalid} 个不可导入链接。`;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '导入失败';
  } finally {
    isImporting.value = false;
  }
}

function folderTreeTempIds(rootTempId: string) {
  const ids = new Set([rootTempId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of preview.value?.folders || []) {
      if (folder.parentTempId && ids.has(folder.parentTempId) && !ids.has(folder.tempId)) {
        ids.add(folder.tempId);
        changed = true;
      }
    }
  }
  return ids;
}

function addFolderAncestors(tempId: string | null, target: Set<string>) {
  let cursor = tempId;
  while (cursor) {
    target.add(cursor);
    cursor = folderByTempId.value.get(cursor)?.parentTempId || null;
  }
}

function toggleFolderSelection(tempId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const subtreeIds = folderTreeTempIds(tempId);
  const nextFolders = new Set(selectedFolderTempIds.value);
  const nextLinks = new Set(selectedLinkTempIds.value);
  if (checked) {
    for (const id of subtreeIds) nextFolders.add(id);
    addFolderAncestors(tempId, nextFolders);
    for (const link of preview.value?.links || []) {
      if (link.status === 'new' && link.folderTempId && subtreeIds.has(link.folderTempId)) nextLinks.add(link.tempId);
    }
  } else {
    for (const id of subtreeIds) nextFolders.delete(id);
    for (const link of preview.value?.links || []) {
      if (link.folderTempId && subtreeIds.has(link.folderTempId)) nextLinks.delete(link.tempId);
    }
  }
  selectedFolderTempIds.value = nextFolders;
  selectedLinkTempIds.value = nextLinks;
}

function toggleLinkSelection(link: BookmarkImportPreview['links'][number], event: Event) {
  if (link.status !== 'new') return;
  const checked = (event.target as HTMLInputElement).checked;
  const nextLinks = new Set(selectedLinkTempIds.value);
  const nextFolders = new Set(selectedFolderTempIds.value);
  if (checked) {
    nextLinks.add(link.tempId);
    addFolderAncestors(link.folderTempId, nextFolders);
  } else {
    nextLinks.delete(link.tempId);
  }
  selectedLinkTempIds.value = nextLinks;
  selectedFolderTempIds.value = nextFolders;
}

function selectAllImportable() {
  selectedFolderTempIds.value = new Set((preview.value?.folders || []).map((folder) => folder.tempId));
  selectedLinkTempIds.value = new Set((preview.value?.links || []).filter((link) => link.status === 'new').map((link) => link.tempId));
}

function clearImportSelection() {
  selectedFolderTempIds.value = new Set();
  selectedLinkTempIds.value = new Set();
}

function folderDepth(tempId: string | null) {
  let depth = 0;
  let cursor = tempId;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    cursor = folderByTempId.value.get(cursor)?.parentTempId || null;
    if (cursor) depth += 1;
  }
  return depth;
}

function folderName(tempId: string | null) {
  return tempId ? folderByTempId.value.get(tempId)?.name || '导入书签' : '导入书签';
}

function exportBookmarks() {
  window.location.href = '/api/admin/bookmarks/export';
}

watch(html, () => {
  preview.value = null;
  clearImportSelection();
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
          <button class="button" data-testid="confirm-import" type="button" :disabled="!preview || !hasImportSelection || isImporting" @click="importBookmarks">
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
          <div>
            <h3>预览结果</h3>
            <span>已选 {{ selectedFolderCount }} 个文件夹 · {{ selectedLinkCount }} 个链接</span>
          </div>
          <div class="toolbar">
            <button class="button secondary compact" data-testid="select-all-import" type="button" @click="selectAllImportable"><CheckSquare :size="15" /> 全选可导入</button>
            <button class="button secondary compact" data-testid="clear-import-selection" type="button" @click="clearImportSelection"><Square :size="15" /> 清空选择</button>
          </div>
        </div>
        <div class="preview-stats">
          <span>新增文件夹 {{ preview.summary.newFolders }}</span>
          <span>新增链接 {{ preview.summary.newLinks }}</span>
          <span>重复链接 {{ preview.summary.duplicateLinks }}</span>
          <span>不可导入 {{ preview.summary.invalidLinks }}</span>
        </div>
        <p v-if="preview.summary.ignoredFolders || preview.summary.ignoredLinks" class="import-scope-note">
          已忽略 Bookmarks 外 {{ preview.summary.ignoredFolders }} 个文件夹、{{ preview.summary.ignoredLinks }} 个链接
        </p>
        <div class="preview-list">
          <label
            v-for="folder in preview.folders"
            :key="folder.tempId"
            class="preview-row preview-folder-row status-new"
            :style="{ '--import-depth': folderDepth(folder.tempId) }"
          >
            <input
              :data-testid="`select-import-folder-${folder.tempId}`"
              type="checkbox"
              :checked="selectedFolderTempIds.has(folder.tempId)"
              @change="toggleFolderSelection(folder.tempId, $event)"
            />
            <strong>{{ folder.name }}</strong>
            <span>{{ folder.parentTempId ? `子文件夹 · ${folderName(folder.parentTempId)}` : '大分类' }}</span>
            <small>导入文件夹</small>
          </label>
          <label
            v-for="link in preview.links"
            :key="link.tempId"
            class="preview-row preview-link-row"
            :class="`status-${link.status}`"
            :style="{ '--import-depth': folderDepth(link.folderTempId) + 1 }"
          >
            <input
              :data-testid="`select-import-link-${link.tempId}`"
              type="checkbox"
              :disabled="link.status !== 'new'"
              :checked="selectedLinkTempIds.has(link.tempId)"
              @change="toggleLinkSelection(link, $event)"
            />
            <strong>{{ link.name }}</strong>
            <span>{{ link.url }}</span>
            <small>{{ link.status === 'new' ? folderName(link.folderTempId) : link.status === 'duplicate' ? '重复' : '不可导入' }}{{ link.reason ? `：${link.reason}` : '' }}</small>
          </label>
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

.import-preview-head > div:first-child {
  display: grid;
  gap: 3px;
}

.button.compact {
  min-height: 34px;
  padding: 0 10px;
}

.import-scope-note {
  background: rgba(245, 158, 11, 0.08);
  border-top: 1px solid rgba(245, 158, 11, 0.2);
  color: #92400e;
  font-size: 13px;
  margin: 0;
  padding: 10px 16px;
}

.preview-row {
  cursor: pointer;
  grid-template-columns: 24px 1fr 1.6fr 1fr;
  padding-left: calc(16px + var(--import-depth, 0) * 18px);
}

.preview-row input {
  accent-color: var(--accent);
  height: 17px;
  width: 17px;
}

.preview-folder-row {
  background: #fafbfe;
}

.preview-link-row:has(input:disabled) {
  color: #64748b;
  cursor: not-allowed;
  filter: saturate(0.45);
}

@media (max-width: 720px) {
  .preview-row {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .preview-row > span,
  .preview-row > small {
    grid-column: 2;
  }
}
</style>
