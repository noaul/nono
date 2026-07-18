<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Archive, CalendarClock, CheckCircle2, Database, Download, Plus, Save, Trash2 } from 'lucide-vue-next';
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

interface BackupAutomationSnapshot {
  settings: {
    enabled: boolean;
    cadence: 'daily' | 'weekly';
    hour: number;
    weekday: number;
    retentionDays: number;
    maxBackups: number;
  };
  status: {
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  };
}

const backups = ref<BackupRecord[]>([]);
const isLoading = ref(true);
const isCreating = ref(false);
const isSavingAutomation = ref(false);
const automation = ref<BackupAutomationSnapshot>({
  settings: { enabled: false, cadence: 'daily', hour: 3, weekday: 0, retentionDays: 30, maxBackups: 14 },
  status: { lastSuccessAt: null, lastFailureAt: null, lastError: null },
});
const deletingIds = ref(new Set<string>());
const message = ref('');
const error = ref('');
const confirmApi = useConfirm();
const componentNames = { postgres: 'PostgreSQL', nodesk: 'Nodesk', nomoney: 'NoMoney' } as const;

async function loadBackups() {
  isLoading.value = true;
  error.value = '';
  try {
    const [data, automationData] = await Promise.all([
      apiRequest<{ backups: BackupRecord[] }>('/api/admin/backups'),
      apiRequest<BackupAutomationSnapshot>('/api/admin/backups/automation'),
    ]);
    backups.value = data.backups;
    automation.value = automationData;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '备份列表加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function saveAutomation() {
  if (isSavingAutomation.value) return;
  isSavingAutomation.value = true;
  message.value = '';
  error.value = '';
  try {
    automation.value = await apiRequest<BackupAutomationSnapshot>('/api/admin/backups/automation', {
      method: 'PUT',
      body: JSON.stringify(automation.value.settings),
    });
    message.value = '自动备份策略已保存';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '自动备份策略保存失败';
  } finally {
    isSavingAutomation.value = false;
  }
}

async function createBackup() {
  if (isCreating.value) return;
  isCreating.value = true;
  message.value = '';
  error.value = '';
  try {
    const data = await apiRequest<{ backup: BackupRecord; automation: BackupAutomationSnapshot }>('/api/admin/backups', { method: 'POST' });
    backups.value = [data.backup, ...backups.value.filter((item) => item.id !== data.backup.id)];
    automation.value = data.automation;
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
        <h2><CalendarClock :size="18" /> 自动备份</h2>
        <label class="backup-toggle">
          <input v-model="automation.settings.enabled" data-testid="backup-automation-enabled" type="checkbox">
          <span>{{ automation.settings.enabled ? '已开启' : '已关闭' }}</span>
        </label>
      </header>

      <div class="backup-policy-grid">
        <label class="field">
          <span>频率</span>
          <select v-model="automation.settings.cadence" class="select" data-testid="backup-cadence">
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
          </select>
        </label>
        <label v-if="automation.settings.cadence === 'weekly'" class="field">
          <span>星期</span>
          <select v-model.number="automation.settings.weekday" class="select" data-testid="backup-weekday">
            <option :value="0">星期日</option>
            <option :value="1">星期一</option>
            <option :value="2">星期二</option>
            <option :value="3">星期三</option>
            <option :value="4">星期四</option>
            <option :value="5">星期五</option>
            <option :value="6">星期六</option>
          </select>
        </label>
        <label class="field">
          <span>执行小时</span>
          <input v-model.number="automation.settings.hour" class="input" data-testid="backup-hour" type="number" min="0" max="23">
        </label>
        <label class="field">
          <span>保留天数</span>
          <input v-model.number="automation.settings.retentionDays" class="input" data-testid="backup-retention-days" type="number" min="1" max="3650">
        </label>
        <label class="field">
          <span>最多份数</span>
          <input v-model.number="automation.settings.maxBackups" class="input" data-testid="backup-max-count" type="number" min="2" max="365">
        </label>
        <button class="button backup-policy-save" data-testid="save-backup-automation" type="button" :disabled="isSavingAutomation" @click="saveAutomation">
          <Save :size="16" /> {{ isSavingAutomation ? '保存中' : '保存策略' }}
        </button>
      </div>

      <div class="backup-policy-status">
        <span>最近成功：{{ automation.status.lastSuccessAt ? formatDate(automation.status.lastSuccessAt) : '暂无' }}</span>
        <span v-if="automation.status.lastFailureAt" class="is-error">最近失败：{{ formatDate(automation.status.lastFailureAt) }}</span>
        <span v-if="automation.status.lastError" class="is-error">{{ automation.status.lastError }}</span>
      </div>
    </section>

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

.backup-toggle {
  align-items: center;
  color: var(--admin-text-muted);
  display: inline-flex;
  font-size: 13px;
  gap: 7px;
}

.backup-toggle input { accent-color: var(--admin-accent); height: 16px; width: 16px; }

.backup-policy-grid {
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(5, minmax(110px, 1fr)) auto;
}

.backup-policy-grid .field { display: grid; gap: 6px; min-width: 0; }
.backup-policy-grid .field > span { color: var(--admin-text-muted); font-size: 12px; }
.backup-policy-grid .input, .backup-policy-grid .select { height: 38px; width: 100%; }
.backup-policy-save { height: 38px; white-space: nowrap; }

.backup-policy-status {
  color: var(--admin-text-muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 8px 18px;
  margin-top: 14px;
}

.backup-policy-status .is-error { color: var(--admin-danger, #c2413b); }

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
  .backup-policy-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .backup-policy-save { grid-column: 1 / -1; }
  .backup-row { align-items: start; grid-template-columns: 36px minmax(0, 1fr) auto; }
  .backup-state { align-items: start; grid-column: 2; justify-items: start; }
  .backup-actions { grid-column: 3; grid-row: 1 / span 2; }
}
</style>
