<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CheckSquare, Download, Eye, Square, Upload } from 'lucide-vue-next';
import { apiRequest, jsonBody } from '@/api/client';
import type { BookmarkImportPreview } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

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
    error.value = t('transfer.needSource');
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
    message.value = t('transfer.previewDone', { folders: result.summary.parsedFolders, links: result.summary.parsedLinks });
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('transfer.previewFailed');
  } finally {
    isPreviewing.value = false;
  }
}

async function importBookmarks() {
  error.value = '';
  message.value = '';
  if (!html.value.trim()) {
    error.value = t('transfer.needSource');
    return;
  }
  if (!preview.value) {
    error.value = t('transfer.needPreview');
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
    message.value = t('transfer.importDone', { folders: result.addedFolders, links: result.addedLinks, duplicates: result.skippedDuplicates, invalid: skippedInvalid });
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('transfer.importFailed');
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
  return tempId ? folderByTempId.value.get(tempId)?.name || t('transfer.importedFolder') : t('transfer.importedFolder');
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
  <section class="admin-card bookmark-transfer-panel">
    <div class="admin-card-head">
      <div>
        <h2>{{ t('transfer.title') }}</h2>
      </div>
      <div class="toolbar">
        <button class="button secondary" data-testid="preview-bookmarks" type="button" :disabled="isPreviewing" @click="previewBookmarks">
          <Eye :size="17" /> {{ isPreviewing ? t('transfer.previewing') : t('transfer.preview') }}
        </button>
        <button class="button" data-testid="confirm-import" type="button" :disabled="!preview || !hasImportSelection || isImporting" @click="importBookmarks">
          <Upload :size="17" /> {{ isImporting ? t('transfer.importing') : t('transfer.confirmImport') }}
        </button>
        <button class="button secondary" type="button" @click="exportBookmarks"><Download :size="17" /> {{ t('transfer.export') }}</button>
      </div>
    </div>
    <p v-if="message" class="notice">{{ message }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="field">
      <label for="bookmark-html-file">{{ t('transfer.pickHtml') }}</label>
      <input id="bookmark-html-file" class="native-file-input" type="file" accept=".html,.htm,text/html" :aria-label="t('transfer.pickHtml')" @change="pickFile" />
    </div>
    <p v-if="fileName" class="row-subtitle">{{ t('transfer.picked', { name: fileName }) }}</p>
    <div class="field">
      <label>Netscape Bookmark HTML</label>
      <textarea v-model="html" :placeholder="t('transfer.pastePlaceholder')" />
    </div>
    <div v-if="preview" class="import-preview-panel">
      <div class="import-preview-head">
        <div>
          <h3>{{ t('transfer.previewResult') }}</h3>
          <span>{{ t('transfer.selectedCount', { folders: selectedFolderCount, links: selectedLinkCount }) }}</span>
        </div>
        <div class="toolbar">
          <button class="button secondary compact" data-testid="select-all-import" type="button" @click="selectAllImportable"><CheckSquare :size="15" /> {{ t('transfer.selectAll') }}</button>
          <button class="button secondary compact" data-testid="clear-import-selection" type="button" @click="clearImportSelection"><Square :size="15" /> {{ t('transfer.clearSelection') }}</button>
        </div>
      </div>
      <div class="preview-stats">
        <span>{{ t('transfer.newFolders', { count: preview.summary.newFolders }) }}</span>
        <span>{{ t('transfer.newLinks', { count: preview.summary.newLinks }) }}</span>
        <span>{{ t('transfer.duplicateLinks', { count: preview.summary.duplicateLinks }) }}</span>
        <span>{{ t('transfer.invalidLinks', { count: preview.summary.invalidLinks }) }}</span>
      </div>
      <p v-if="preview.summary.ignoredFolders || preview.summary.ignoredLinks" class="import-scope-note">
        {{ t('transfer.ignored', { folders: preview.summary.ignoredFolders, links: preview.summary.ignoredLinks }) }}
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
          <span>{{ folder.parentTempId ? t('transfer.subfolderOf', { name: folderName(folder.parentTempId) }) : t('transfer.topCategory') }}</span>
          <small>{{ t('transfer.importFolder') }}</small>
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
          <small>{{ link.status === 'new' ? folderName(link.folderTempId) : link.status === 'duplicate' ? t('transfer.duplicate') : t('transfer.invalid') }}{{ link.reason ? ` · ${link.reason}` : '' }}</small>
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.native-file-input {
  cursor: pointer;
  padding: 8px;
}

.native-file-input::file-selector-button {
  background: var(--admin-surface-elevated);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--admin-text);
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
  color: var(--admin-status-warn);
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
  background: var(--admin-surface-sunken);
}

.preview-link-row:has(input:disabled) {
  color: var(--admin-text-muted);
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
