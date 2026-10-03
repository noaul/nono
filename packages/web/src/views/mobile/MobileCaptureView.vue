<script setup lang="ts">
import '@/styles/admin.css';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { BookmarkPlus, CircleCheck, RotateCcw } from '@lucide/vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { ApiError, apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link } from '@/api/types';
import { useI18n } from '@/composables/useI18n';
import { normalizeCaptureUrl, notifyCaptureSaved, subscribeCapture, type PendingCapture } from '@/mobile/capture';
import { dismissPendingCapture, requestPendingCapture } from '@/mobile/shell';

const LAST_FOLDER_KEY = 'nono:mobile-capture-folder';

const { t } = useI18n();

const capture = ref<PendingCapture | null>(null);
const form = reactive({ name: '', url: '', description: '', folderId: 0 });
const folders = ref<Folder[]>([]);
const foldersState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const foldersError = ref('');
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const saveError = ref('');
const saved = ref<Link | null>(null);

const folderOptions = computed(() => {
  const byId = new Map(folders.value.map((folder) => [folder.id, folder]));
  const ordered = [...folders.value].sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id);
  const result: Array<{ id: number; label: string }> = [];
  const visit = (folder: Folder, path: string[], seen: Set<number>) => {
    if (seen.has(folder.id)) return;
    seen.add(folder.id);
    const names = [...path, folder.name];
    result.push({ id: folder.id, label: names.join(' / ') });
    for (const child of ordered.filter((item) => item.parentId === folder.id)) visit(child, names, seen);
  };
  const seen = new Set<number>();
  for (const root of ordered.filter((folder) => !folder.parentId || !byId.has(folder.parentId))) visit(root, [], seen);
  return result;
});
const savedFolderLabel = computed(() => folderOptions.value.find((option) => option.id === saved.value?.folderId)?.label || '');
const urlCheck = computed(() => normalizeCaptureUrl(form.url));
const canSave = computed(() => foldersState.value === 'ready' && form.folderId > 0 && urlCheck.value.ok && saveState.value !== 'saving');

function startEditing(next: PendingCapture) {
  capture.value = next;
  form.name = next.title || '';
  form.url = next.url;
  form.description = '';
  saveState.value = 'idle';
  saveError.value = '';
  saved.value = null;
  if (foldersState.value !== 'ready' && foldersState.value !== 'loading') void loadFolders();
}

let unsubscribe: (() => void) | null = null;
onMounted(() => {
  unsubscribe = subscribeCapture((next) => {
    if (!next) {
      // Keep the saved result on screen; otherwise drop back to the empty state.
      if (saveState.value !== 'saved') capture.value = null;
      return;
    }
    if (next.requestId !== capture.value?.requestId) startEditing(next);
  });
  requestPendingCapture();
});
onBeforeUnmount(() => unsubscribe?.());

async function loadFolders() {
  foldersState.value = 'loading';
  foldersError.value = '';
  try {
    folders.value = await apiRequest<Folder[]>('/api/admin/folders');
    foldersState.value = 'ready';
    if (!folderOptions.value.some((option) => option.id === form.folderId)) form.folderId = preferredFolderId();
  } catch (event) {
    foldersError.value = event instanceof Error ? event.message : t('mobileCapture.foldersFailed');
    foldersState.value = 'error';
  }
}

function preferredFolderId() {
  const remembered = Number(readStorage(LAST_FOLDER_KEY));
  if (folderOptions.value.some((option) => option.id === remembered)) return remembered;
  // Prefer a folder inside a NoTab over the NoTab itself, like the bookmark form does.
  return folders.value.find((folder) => folder.parentId)?.id || folderOptions.value[0]?.id || 0;
}

function readStorage(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* Private mode: remembering the folder is optional. */ }
}

async function save() {
  if (!capture.value || !canSave.value) return;
  const savingRequestId = capture.value.requestId;
  saveState.value = 'saving';
  saveError.value = '';
  try {
    const link = await apiRequest<Link>('/api/mobile/bookmarks', {
      method: 'POST',
      body: jsonBody({
        requestId: savingRequestId,
        folderId: form.folderId,
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
      }),
    });
    notifyCaptureSaved(savingRequestId);
    if (capture.value?.requestId !== savingRequestId) return;
    saved.value = link;
    saveState.value = 'saved';
    writeStorage(LAST_FOLDER_KEY, String(form.folderId));
  } catch (event) {
    if (capture.value?.requestId !== savingRequestId) return;
    saveError.value = saveErrorMessage(event);
    saveState.value = 'error';
  }
}

function saveErrorMessage(event: unknown) {
  if (event instanceof ApiError) {
    if (event.code === 401) return t('mobileCapture.sessionExpired');
    if (event.code === 409) return t('mobileCapture.conflict');
    if (event.code === 410) return t('mobileCapture.gone');
    return event.message || t('mobileCapture.saveFailed');
  }
  return t('mobileCapture.networkFailed');
}
</script>

<template>
  <main class="mobile-capture" data-testid="mobile-capture">
    <header class="mobile-capture-head">
      <BookmarkPlus :size="18" aria-hidden="true" />
      <h1>{{ t('mobileCapture.title') }}</h1>
    </header>

    <section v-if="!capture" class="mobile-capture-empty" data-testid="capture-empty">
      <p class="mobile-capture-empty-title">{{ t('mobileCapture.emptyTitle') }}</p>
      <p>{{ t('mobileCapture.emptyBody') }}</p>
      <RouterLink class="button secondary" to="/admin/links">{{ t('mobileCapture.openBookmarks') }}</RouterLink>
    </section>

    <section v-else-if="saveState === 'saved' && saved" class="admin-section mobile-capture-result" data-testid="capture-saved">
      <AdminStateBanner
        :tone="saved.existing ? 'info' : 'success'"
        :message="saved.existing ? t('mobileCapture.alreadySaved', { folder: savedFolderLabel }) : t('mobileCapture.saved', { folder: savedFolderLabel })"
      />
      <dl class="mobile-capture-summary">
        <dt>{{ t('mobileCapture.name') }}</dt>
        <dd>{{ saved.name }}</dd>
        <dt>{{ t('mobileCapture.url') }}</dt>
        <dd class="mobile-capture-url">{{ saved.url }}</dd>
      </dl>
      <div class="admin-section-actions">
        <RouterLink class="button secondary" to="/admin/links"><CircleCheck :size="16" /> {{ t('mobileCapture.openBookmarks') }}</RouterLink>
      </div>
    </section>

    <form v-else class="admin-section mobile-capture-form" data-testid="capture-form" novalidate @submit.prevent="save">
      <div class="field">
        <label for="capture-name">{{ t('mobileCapture.name') }}</label>
        <input id="capture-name" v-model="form.name" type="text" maxlength="240" :placeholder="t('mobileCapture.namePlaceholder')" />
      </div>
      <div class="field">
        <label for="capture-url">{{ t('mobileCapture.url') }}</label>
        <input
          id="capture-url"
          v-model="form.url"
          type="url"
          inputmode="url"
          maxlength="4096"
          autocomplete="off"
          spellcheck="false"
          :aria-invalid="!urlCheck.ok"
          required
        />
        <small v-if="!urlCheck.ok" class="mobile-capture-hint">{{ t('mobileCapture.invalidUrl') }}</small>
      </div>
      <div class="field">
        <label for="capture-description">{{ t('mobileCapture.description') }} <span class="mobile-capture-optional">{{ t('common.optional') }}</span></label>
        <textarea id="capture-description" v-model="form.description" maxlength="2000" rows="3"></textarea>
      </div>
      <div class="field">
        <label for="capture-folder">{{ t('mobileCapture.folder') }}</label>
        <select
          id="capture-folder"
          v-model.number="form.folderId"
          data-testid="capture-folder"
          :disabled="foldersState !== 'ready' || !folderOptions.length"
        >
          <option v-if="foldersState === 'loading'" :value="0">{{ t('common.loading') }}</option>
          <option v-else-if="foldersState === 'ready' && !folderOptions.length" :value="0">{{ t('mobileCapture.noFolders') }}</option>
          <option v-for="option in folderOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </div>

      <div v-if="foldersState === 'error'" class="mobile-capture-retry" data-testid="capture-folders-error">
        <AdminStateBanner tone="error" :message="foldersError" />
        <button class="button secondary" type="button" data-testid="capture-retry-folders" @click="loadFolders">
          <RotateCcw :size="16" /> {{ t('common.retry') }}
        </button>
      </div>
      <div v-if="saveState === 'error'" data-testid="capture-save-error">
        <AdminStateBanner tone="error" :message="saveError" />
      </div>

      <div class="mobile-capture-actions">
        <button class="button secondary" type="button" data-testid="capture-dismiss" :disabled="saveState === 'saving'" @click="dismissPendingCapture(capture.requestId)">{{ t('common.cancel') }}</button>
        <button class="button" type="submit" data-testid="capture-save" :disabled="!canSave">
          {{ saveState === 'saving' ? t('common.saving') : saveState === 'error' ? t('mobileCapture.retrySave') : t('common.save') }}
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.mobile-capture { background: var(--ui-canvas); color: var(--ui-text); display: flex; flex-direction: column; gap: var(--ui-space-4); margin: 0 auto; max-width: 640px; min-height: 100vh; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); }
.mobile-capture-head { align-items: center; color: var(--ui-text); display: flex; gap: var(--ui-space-2); }
.mobile-capture-head svg { color: var(--ui-accent); }
.mobile-capture-head h1 { font-size: 16px; font-weight: 600; margin: 0; }
.mobile-capture-empty { border: 1px dashed var(--ui-border-strong); border-radius: var(--ui-radius-sm); color: var(--ui-text-muted); display: grid; font-size: 13px; gap: var(--ui-space-2); justify-items: start; padding: 16px; }
.mobile-capture-empty p { margin: 0; }
.mobile-capture-empty-title { color: var(--ui-text); font-weight: 600; }
.mobile-capture-hint { color: var(--ui-danger); font-size: 12px; }
.mobile-capture-optional { color: var(--ui-text-subtle); font-weight: 400; }
.mobile-capture-retry { display: grid; gap: var(--ui-space-2); justify-items: start; }
.mobile-capture-actions { display: flex; gap: 8px; justify-content: flex-end; }
.mobile-capture-actions .button { min-width: 120px; }
.mobile-capture-summary { display: grid; font-size: 13px; gap: 4px 12px; grid-template-columns: max-content minmax(0, 1fr); margin: 0; }
.mobile-capture-summary dt { color: var(--ui-text-muted); }
.mobile-capture-summary dd { margin: 0; min-width: 0; }
.mobile-capture-url { overflow-wrap: anywhere; }
@media (max-width: 480px) {
  .mobile-capture-actions .button { width: 100%; }
}
</style>
