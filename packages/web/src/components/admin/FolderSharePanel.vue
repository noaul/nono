<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Check, Copy, Link2, Plus, Trash2 } from '@lucide/vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, FolderShare } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';
import { formatShanghaiDateTime } from '@/utils/dateTime';

const props = defineProps<{ folder: Folder }>();

const { t } = useI18n();
const confirmApi = useConfirm();
const shares = ref<FolderShare[]>([]);
const loading = ref(true);
const creating = ref(false);
const expiryDays = ref('');
const copiedId = ref<number | null>(null);

function fullUrl(share: FolderShare) {
  return `${window.location.origin}${share.path}`;
}

async function load() {
  loading.value = true;
  try {
    shares.value = await apiRequest<FolderShare[]>(`/api/admin/folders/${props.folder.id}/shares`);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('shares.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function create() {
  if (creating.value) return;
  creating.value = true;
  try {
    const share = await apiRequest<FolderShare>(`/api/admin/folders/${props.folder.id}/shares`, {
      method: 'POST',
      body: jsonBody({ expiresInDays: expiryDays.value ? Number(expiryDays.value) : null }),
    });
    shares.value = [share, ...shares.value];
    await copy(share);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('shares.createFailed'));
  } finally {
    creating.value = false;
  }
}

async function copy(share: FolderShare) {
  try {
    await navigator.clipboard.writeText(fullUrl(share));
    copiedId.value = share.id;
    notifySuccess(t('shares.copied'));
  } catch {
    // Clipboard can be unavailable (insecure context); the link stays visible to copy by hand.
  }
}

async function revoke(share: FolderShare) {
  const confirmed = await confirmApi.confirm({ title: t('shares.revoke'), message: t('shares.revokeConfirm'), confirmText: t('shares.revoke'), tone: 'danger' });
  if (!confirmed) return;
  try {
    await apiRequest(`/api/admin/shares/${share.id}`, { method: 'DELETE' });
    shares.value = shares.value.filter((item) => item.id !== share.id);
    notifySuccess(t('shares.revoked'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('shares.revokeFailed'));
  }
}

function formatDate(value: string) {
  return formatShanghaiDateTime(value, 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

watch(() => props.folder.id, load);
onMounted(load);
</script>

<template>
  <section class="folder-share-panel" data-testid="folder-share-panel" :aria-label="t('shares.title')">
    <header class="folder-share-head">
      <strong><Link2 :size="15" /> {{ t('shares.title') }}</strong>
      <div class="folder-share-create">
        <select v-model="expiryDays" data-testid="share-expiry" :aria-label="t('shares.expiry')">
          <option value="">{{ t('tokens.never') }}</option>
          <option value="1">{{ t('tokens.days', { count: 1 }) }}</option>
          <option value="7">{{ t('tokens.days', { count: 7 }) }}</option>
          <option value="30">{{ t('tokens.days', { count: 30 }) }}</option>
        </select>
        <button class="button compact" data-testid="create-share" type="button" :disabled="creating" @click="create">
          <Plus :size="15" /> {{ creating ? t('common.saving') : t('shares.create') }}
        </button>
      </div>
    </header>
    <p class="folder-share-hint">{{ t('shares.hint') }}</p>
    <p v-if="!loading && !shares.length" class="folder-share-empty">{{ t('shares.empty') }}</p>
    <div v-else class="folder-share-list">
      <article v-for="share in shares" :key="share.id" class="folder-share-row" :class="{ expired: share.expired }" :data-testid="`share-${share.id}`">
        <code>{{ fullUrl(share) }}</code>
        <small>
          {{ share.expired ? t('shares.expired') : share.expiresAt ? t('shares.expiresAt', { date: formatDate(share.expiresAt) }) : t('tokens.never') }}
          · {{ t('shares.views', { count: share.viewCount }) }}
        </small>
        <div class="row-actions">
          <button class="icon-button secondary" type="button" :title="t('tokens.copy')" :aria-label="t('tokens.copy')" @click="copy(share)">
            <Check v-if="copiedId === share.id" :size="15" /><Copy v-else :size="15" />
          </button>
          <button class="icon-button danger" type="button" :data-testid="`revoke-share-${share.id}`" :title="t('shares.revoke')" :aria-label="t('shares.revoke')" @click="revoke(share)">
            <Trash2 :size="15" />
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.folder-share-panel {
  background: var(--ui-surface-sunken);
  border-radius: var(--ui-radius-sm);
  display: grid;
  gap: 10px;
  padding: 12px;
}

.folder-share-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
}

.folder-share-head strong {
  align-items: center;
  display: inline-flex;
  font-size: 13px;
  gap: 6px;
}

.folder-share-create {
  align-items: center;
  display: flex;
  gap: 8px;
}

.folder-share-create select {
  min-height: 32px;
  width: auto;
}

.folder-share-hint,
.folder-share-empty {
  color: var(--ui-text-muted);
  font-size: 12px;
  margin: 0;
}

.folder-share-list {
  display: grid;
  gap: 6px;
}

.folder-share-row {
  align-items: center;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  display: grid;
  gap: 4px 10px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 8px 10px;
}

.folder-share-row code {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-share-row small {
  color: var(--ui-text-muted);
  font-size: 12px;
  grid-column: 1;
}

.folder-share-row .row-actions {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.folder-share-row.expired code {
  color: var(--ui-text-muted);
  text-decoration: line-through;
}
</style>
