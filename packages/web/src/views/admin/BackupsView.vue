<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Archive, CheckCircle2, Database, Download, Plus, Trash2 } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest } from '@/api/client';
import { useConfirm } from '@/composables/useConfirm';

interface BackupRecord {
  id: string;
  filename: string;
  createdAt: string;
  sourceCommit: string;
  size: number;
  sha256: string;
  status: 'verified';
  components: Array<'postgres' | 'nodesk' | 'nomoney'>;
}

const backups = ref<BackupRecord[]>([]);
const isLoading = ref(true);
const isCreating = ref(false);
const deletingIds = ref(new Set<string>());
const message = ref('');
const error = ref('');
const confirmApi = useConfirm();
const componentNames = { postgres: 'PostgreSQL', nodesk: 'Nodesk', nomoney: 'NoMoney' } as const;

async function loadBackups() {
  isLoading.value = true;
  error.value = '';
  try {
    const data = await apiRequest<{ backups: BackupRecord[] }>('/api/admin/backups');
    backups.value = data.backups;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '备份列表加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function createBackup() {
  if (isCreating.value) return;
  isCreating.value = true;
  message.value = '';
  error.value = '';
  try {
    const data = await apiRequest<{ backup: BackupRecord }>('/api/admin/backups', { method: 'POST' });
    backups.value = [data.backup, ...backups.value.filter((item) => item.id !== data.backup.id)];
    message.value = '全站备份已创建并校验';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '创建备份失败';
  } finally {
    isCreating.value = false;
  }
}

async function removeBackup(backup: BackupRecord) {
  if (!await confirmApi.confirm({ title: '删除备份', message: formatDate(backup.createdAt), confirmText: '删除', tone: 'danger' })) return;
  deletingIds.value = new Set(deletingIds.value).add(backup.id);
  message.value = '';
  error.value = '';
  try {
    await apiRequest(`/api/admin/backups/${backup.id}`, { method: 'DELETE' });
    backups.value = backups.value.filter((item) => item.id !== backup.id);
    message.value = '备份已删除';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '删除备份失败';
  } finally {
    const remaining = new Set(deletingIds.value);
    remaining.delete(backup.id);
    deletingIds.value = remaining;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${trimNumber(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${trimNumber(bytes / 1024 / 1024)} MB`;
  return `${trimNumber(bytes / 1024 / 1024 / 1024)} GB`;
}

function trimNumber(value: number) {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, '');
}

onMounted(loadBackups);
</script>

<template>
  <div class="admin-page-stack backups-page">
    <AdminPageHeader eyebrow="系统" title="备份与恢复">
      <template #actions>
        <button class="button" data-testid="create-backup" type="button" :disabled="isCreating" @click="createBackup">
          <Plus :size="17" /> {{ isCreating ? '备份中' : '创建备份' }}
        </button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-section backup-section">
      <header class="admin-section-head">
        <h2><Archive :size="18" /> 全站备份</h2>
        <span class="backup-count">{{ backups.length }}</span>
      </header>

      <p v-if="isLoading" class="backup-empty">正在读取备份</p>
      <p v-else-if="!backups.length" class="backup-empty">暂无备份</p>
      <div v-else class="backup-list">
        <article v-for="backup in backups" :key="backup.id" class="backup-row" :data-testid="`backup-${backup.id}`">
          <span class="backup-icon"><Database :size="19" /></span>
          <div class="backup-main">
            <strong>{{ formatDate(backup.createdAt) }}</strong>
            <div class="backup-components">
              <span v-for="component in backup.components" :key="component">{{ componentNames[component] }}</span>
            </div>
            <small>{{ backup.sourceCommit.slice(0, 12) }} · {{ backup.sha256.slice(0, 12) }}</small>
          </div>
          <div class="backup-state">
            <span><CheckCircle2 :size="14" /> 已校验</span>
            <strong>{{ formatBytes(backup.size) }}</strong>
          </div>
          <div class="backup-actions">
            <a
              class="icon-button secondary"
              :data-testid="`download-backup-${backup.id}`"
              :href="`/api/admin/backups/${backup.id}/download`"
              :download="backup.filename"
              title="下载备份"
              aria-label="下载备份"
            ><Download :size="16" /></a>
            <button
              class="icon-button danger"
              :data-testid="`delete-backup-${backup.id}`"
              type="button"
              title="删除备份"
              aria-label="删除备份"
              :disabled="deletingIds.has(backup.id)"
              @click="removeBackup(backup)"
            ><Trash2 :size="16" /></button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backup-section { min-width: 0; }

.backup-count {
  align-items: center;
  background: var(--admin-control-bg);
  border: 1px solid var(--admin-border);
  border-radius: 7px;
  color: var(--admin-text-muted);
  display: inline-flex;
  font-size: 12px;
  height: 26px;
  justify-content: center;
  min-width: 30px;
  padding: 0 8px;
}

.backup-list {
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-control);
  overflow: hidden;
}

.backup-row {
  align-items: center;
  background: var(--admin-surface-elevated);
  display: grid;
  gap: 12px;
  grid-template-columns: 38px minmax(0, 1fr) auto auto;
  min-height: 78px;
  padding: 11px 12px;
}

.backup-row + .backup-row { border-top: 1px solid var(--admin-border); }

.backup-icon {
  align-items: center;
  background: var(--admin-control-bg);
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  color: var(--admin-accent);
  display: inline-flex;
  height: 36px;
  justify-content: center;
  width: 36px;
}

.backup-main { display: grid; gap: 5px; min-width: 0; }
.backup-main strong, .backup-state strong { color: var(--admin-text); font-size: 14px; }
.backup-main small, .backup-empty { color: var(--admin-text-muted); font-size: 12px; }
.backup-components { display: flex; flex-wrap: wrap; gap: 5px; }

.backup-components span {
  background: var(--admin-control-bg);
  border: 1px solid var(--admin-border);
  border-radius: 5px;
  color: var(--admin-text-muted);
  font-size: 11px;
  padding: 2px 6px;
}

.backup-state { align-items: flex-end; display: grid; gap: 5px; justify-items: end; min-width: 78px; }
.backup-state span { align-items: center; color: var(--admin-success, #16845b); display: inline-flex; font-size: 12px; gap: 4px; }
.backup-actions { display: flex; gap: 6px; }
.backup-empty { margin: 0; padding: 22px 4px 8px; text-align: center; }

@media (max-width: 720px) {
  .backup-row { align-items: start; grid-template-columns: 36px minmax(0, 1fr) auto; }
  .backup-state { align-items: start; grid-column: 2; justify-items: start; }
  .backup-actions { grid-column: 3; grid-row: 1 / span 2; }
}
</style>
