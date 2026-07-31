<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
} from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { AuditLogEntry, AuditLogPage, AuditSettings } from '@/api/types';
import { useI18n } from '@/composables/useI18n';
import type { MessageKey } from '@/locales';

const { t } = useI18n();

const logs = ref<AuditLogEntry[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const isLoading = ref(true);
const isSavingSettings = ref(false);
const error = ref('');
const feedback = ref('');
const expandedId = ref<number | null>(null);
const retentionDays = ref(180);

const filters = ref({
  search: '',
  actor: '',
  action: '',
  resourceType: '',
  result: '',
  from: '',
  to: '',
});

const resourceKeys = [
  ['notab', 'nav.kindNotab'],
  ['folder', 'nav.kindFolder'],
  ['bookmark', 'nav.kindBookmark'],
  ['site', 'audit.rSite'],
  ['user', 'audit.rUser'],
  ['token', 'audit.rToken'],
  ['backup', 'audit.rBackup'],
  ['account', 'audit.rAccount'],
  ['session', 'audit.rSession'],
  ['passkey', 'audit.rPasskey'],
  ['llm', 'audit.rLlm'],
  ['nodesk', 'audit.rNodesk'],
  ['nostar', 'audit.rNostar'],
  ['system', 'audit.rSystem'],
  ['audit', 'audit.rAudit'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>;

const actionKeys = [
  ['create', 'audit.aCreate'],
  ['update', 'audit.aUpdate'],
  ['delete', 'audit.aDelete'],
  ['reorder', 'audit.aReorder'],
  ['bulk_move', 'audit.aBulkMove'],
  ['bulk_delete', 'audit.aBulkDelete'],
  ['import', 'audit.aImport'],
  ['health_check', 'audit.aHealthCheck'],
  ['health_repair', 'audit.aHealthRepair'],
  ['settings_update', 'audit.aSettingsUpdate'],
  ['test_connection', 'audit.aTestConnection'],
  ['sync', 'audit.aSync'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>;

const resourceOptions = computed(() => resourceKeys.map(([value, key]) => [value, t(key)] as const));
const actionOptions = computed(() => actionKeys.map(([value, key]) => [value, t(key)] as const));
const resourceLabels = computed(() => Object.fromEntries(resourceOptions.value) as Record<string, string>);
const actionLabels = computed(() => Object.fromEntries(actionOptions.value) as Record<string, string>);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const rangeStart = computed(() => (total.value ? (page.value - 1) * pageSize + 1 : 0));
const rangeEnd = computed(() => Math.min(page.value * pageSize, total.value));

async function loadLogs() {
  isLoading.value = true;
  error.value = '';
  try {
    const query = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
    if (filters.value.search.trim()) query.set('search', filters.value.search.trim());
    if (filters.value.actor.trim()) query.set('actor', filters.value.actor.trim());
    if (filters.value.action) query.set('action', filters.value.action);
    if (filters.value.resourceType) query.set('resourceType', filters.value.resourceType);
    if (filters.value.result) query.set('result', filters.value.result);
    if (filters.value.from) query.set('from', new Date(filters.value.from).toISOString());
    if (filters.value.to) query.set('to', new Date(filters.value.to).toISOString());
    const response = await apiRequest<AuditLogPage>(`/api/admin/audit?${query.toString()}`);
    logs.value = response.items;
    total.value = response.total;
    expandedId.value = null;
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('audit.loadFailed');
  } finally {
    isLoading.value = false;
  }
}

async function loadSettings() {
  try {
    const settings = await apiRequest<AuditSettings>('/api/admin/audit/settings');
    retentionDays.value = settings.retentionDays;
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('audit.retentionLoadFailed');
  }
}

async function applyFilters() {
  page.value = 1;
  await loadLogs();
}

async function resetFilters() {
  filters.value = { search: '', actor: '', action: '', resourceType: '', result: '', from: '', to: '' };
  page.value = 1;
  await loadLogs();
}

async function movePage(direction: -1 | 1) {
  const nextPage = page.value + direction;
  if (nextPage < 1 || nextPage > totalPages.value) return;
  page.value = nextPage;
  await loadLogs();
}

async function saveRetention() {
  const days = Math.max(7, Math.min(3650, Math.round(Number(retentionDays.value) || 180)));
  retentionDays.value = days;
  isSavingSettings.value = true;
  error.value = '';
  feedback.value = '';
  try {
    const updated = await apiRequest<AuditSettings>('/api/admin/audit/settings', {
      method: 'PUT',
      body: jsonBody({ retentionDays: days }),
    });
    retentionDays.value = updated.retentionDays;
    feedback.value = updated.removed ? t('audit.retentionSavedCleaned', { count: updated.removed }) : t('audit.retentionSaved');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('audit.retentionSaveFailed');
  } finally {
    isSavingSettings.value = false;
  }
}

function toggleDetails(id: number) {
  expandedId.value = expandedId.value === id ? null : id;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDetails(details: Record<string, unknown>) {
  return JSON.stringify(details || {}, null, 2);
}

onMounted(() => {
  void Promise.all([loadLogs(), loadSettings()]);
});
</script>

<template>
  <div class="admin-page-stack audit-page">
    <AdminPageHeader :eyebrow="t('admin.sectionSystem')" :title="t('admin.titleAudit')">
      <template #actions>
        <div class="audit-header-actions">
          <div class="audit-retention-control">
            <span class="audit-retention-label">{{ t('audit.retain') }}</span>
            <input
              v-model.number="retentionDays"
              data-testid="audit-retention-days"
              type="number"
              min="7"
              max="3650"
              :aria-label="t('audit.retentionDays')"
            />
            <span class="audit-retention-unit">{{ t('audit.days') }}</span>
            <button
              class="icon-button secondary"
              data-testid="audit-save-retention"
              type="button"
              :title="t('audit.saveRetention')"
              :aria-label="t('audit.saveRetention')"
              :disabled="isSavingSettings"
              @click="saveRetention"
            ><Save :size="16" /></button>
          </div>
          <button class="icon-button secondary" type="button" :title="t('audit.refresh')" :aria-label="t('audit.refresh')" :disabled="isLoading" @click="loadLogs">
            <RefreshCw :size="16" :class="{ spinning: isLoading }" />
          </button>
        </div>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="error" :message="error" tone="error" />
    <AdminStateBanner v-else-if="feedback" :message="feedback" tone="success" />

    <section class="audit-workspace" :aria-label="t('audit.workspace')">
      <form data-testid="audit-filter-form" class="audit-filter-bar" @submit.prevent="applyFilters">
        <label class="audit-search-field">
          <Search :size="16" aria-hidden="true" />
          <input v-model="filters.search" data-testid="audit-search" type="search" :placeholder="t('audit.searchPlaceholder')" :aria-label="t('audit.searchAria')" />
        </label>
        <input v-model="filters.actor" data-testid="audit-actor" type="search" :placeholder="t('audit.actor')" :aria-label="t('audit.filterActor')" />
        <select v-model="filters.resourceType" data-testid="audit-resource" :aria-label="t('audit.filterResource')">
          <option value="">{{ t('audit.allResources') }}</option>
          <option v-for="option in resourceOptions" :key="option[0]" :value="option[0]">{{ option[1] }}</option>
        </select>
        <select v-model="filters.action" :aria-label="t('audit.filterAction')">
          <option value="">{{ t('audit.allActions') }}</option>
          <option v-for="option in actionOptions" :key="option[0]" :value="option[0]">{{ option[1] }}</option>
        </select>
        <select v-model="filters.result" data-testid="audit-result" :aria-label="t('audit.filterResult')">
          <option value="">{{ t('audit.allResults') }}</option>
          <option value="success">{{ t('audit.success') }}</option>
          <option value="failure">{{ t('audit.failure') }}</option>
        </select>
        <input v-model="filters.from" type="datetime-local" :aria-label="t('audit.from')" />
        <input v-model="filters.to" type="datetime-local" :aria-label="t('audit.to')" />
        <div class="audit-filter-actions">
          <button class="button compact" type="submit"><Search :size="15" />{{ t('audit.filter') }}</button>
          <button class="icon-button secondary" type="button" :title="t('audit.clearFilters')" :aria-label="t('audit.clearFilters')" @click="resetFilters"><RotateCcw :size="15" /></button>
        </div>
      </form>

      <div class="audit-list-meta">
        <span>{{ t('audit.totalCount', { count: total }) }}</span>
        <span v-if="total">{{ t('audit.range', { start: rangeStart, end: rangeEnd }) }}</span>
      </div>

      <div class="audit-table-scroll">
        <div class="audit-table" role="table" :aria-label="t('audit.tableAria')">
          <div class="audit-grid audit-table-head" role="row">
            <span></span>
            <span>{{ t('audit.actor') }}</span>
            <span>{{ t('audit.action') }}</span>
            <span>{{ t('audit.resource') }}</span>
            <span>{{ t('audit.result') }}</span>
            <span>{{ t('audit.time') }}</span>
            <span>{{ t('audit.sourceIp') }}</span>
          </div>

          <div v-if="isLoading" class="audit-empty">{{ t('audit.loading') }}</div>
          <div v-else-if="!logs.length" class="audit-empty">{{ t('audit.empty') }}</div>
          <article v-for="entry in logs" v-else :key="entry.id" class="audit-entry">
            <div :data-testid="`audit-row-${entry.id}`" class="audit-grid audit-row" role="row">
              <button
                class="audit-expand-button"
                type="button"
                :data-testid="`audit-expand-${entry.id}`"
                :title="expandedId === entry.id ? t('audit.collapse') : t('audit.expand')"
                :aria-label="expandedId === entry.id ? t('audit.collapse') : t('audit.expand')"
                :aria-expanded="expandedId === entry.id"
                @click="toggleDetails(entry.id)"
              >
                <ChevronDown v-if="expandedId === entry.id" :size="15" />
                <ChevronRight v-else :size="15" />
              </button>
              <div class="audit-actor">
                <strong>{{ entry.actorUsername }}</strong>
                <small>{{ entry.actorRole === 'admin' ? t('admin.roleAdmin') : t('admin.roleMember') }}</small>
              </div>
              <span class="audit-action">{{ actionLabels[entry.action] || entry.action }}</span>
              <div class="audit-resource">
                <strong>{{ entry.resourceLabel || resourceLabels[entry.resourceType] || entry.resourceType }}</strong>
                <small>{{ resourceLabels[entry.resourceType] || entry.resourceType }}<template v-if="entry.resourceId"> · {{ entry.resourceId }}</template></small>
              </div>
              <span class="audit-result" :class="`is-${entry.result}`">
                <CheckCircle2 v-if="entry.result === 'success'" :size="14" />
                <CircleX v-else :size="14" />
                {{ entry.result === 'success' ? t('audit.success') : t('audit.failure') }} · {{ entry.statusCode }}
              </span>
              <time class="audit-time" :datetime="entry.createdAt">{{ formatTime(entry.createdAt) }}</time>
              <code class="audit-ip">{{ entry.ipAddress || '—' }}</code>
            </div>
            <div v-if="expandedId === entry.id" :data-testid="`audit-details-${entry.id}`" class="audit-details">
              <pre>{{ formatDetails(entry.details) }}</pre>
              <div class="audit-client"><span>{{ t('audit.client') }}</span><code>{{ entry.userAgent || '—' }}</code></div>
            </div>
          </article>
        </div>
      </div>

      <footer class="audit-pagination">
        <span>{{ t('audit.pageOf', { page, total: totalPages }) }}</span>
        <div>
          <button class="icon-button secondary" type="button" :title="t('audit.prevPage')" :aria-label="t('audit.prevPage')" :disabled="page <= 1 || isLoading" @click="movePage(-1)"><ChevronLeft :size="16" /></button>
          <button class="icon-button secondary" data-testid="audit-next" type="button" :title="t('audit.nextPage')" :aria-label="t('audit.nextPage')" :disabled="page >= totalPages || isLoading" @click="movePage(1)"><ChevronRight :size="16" /></button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.audit-retention-control {
  align-items: center;
  color: var(--admin-text-muted);
  display: flex;
  font-size: 12px;
  gap: 6px;
}

.audit-header-actions { align-items: center; display: flex; flex-wrap: nowrap; gap: 8px; }

.audit-retention-control input {
  height: 34px;
  min-height: 34px !important;
  padding: 5px 7px;
  text-align: center;
  width: 70px;
}

.audit-retention-control .icon-button,
.admin-page-actions > .icon-button { height: 34px; min-height: 34px; width: 34px; }

.audit-workspace {
  background: var(--admin-surface-elevated);
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  min-width: 0;
  overflow: hidden;
}

.audit-filter-bar {
  align-items: center;
  border-bottom: 1px solid var(--admin-border);
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(190px, 1.4fr) minmax(110px, .7fr) repeat(3, minmax(116px, .72fr)) minmax(155px, .9fr) minmax(155px, .9fr) auto;
  padding: 12px;
}

.audit-filter-bar > input,
.audit-filter-bar > select,
.audit-search-field { height: 36px; min-height: 36px; min-width: 0; }

.audit-filter-bar > input,
.audit-filter-bar > select { padding: 6px 9px; }

.audit-search-field {
  align-items: center;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  color: var(--admin-text-muted);
  display: flex;
  gap: 7px;
  padding: 0 9px;
}

.audit-search-field:focus-within { border-color: var(--admin-text); box-shadow: 0 0 0 2px var(--admin-border); }
.audit-search-field input { border: 0 !important; box-shadow: none !important; height: 34px; min-height: 34px !important; min-width: 0; padding: 0 !important; width: 100%; }
.audit-filter-actions { display: flex; gap: 6px; }
.audit-filter-actions .button { min-height: 36px; padding: 0 11px; }
.audit-filter-actions .icon-button { height: 36px; min-height: 36px; width: 36px; }

.audit-list-meta {
  align-items: center;
  background: var(--admin-surface-elevated);
  border-bottom: 1px solid var(--admin-border);
  color: var(--admin-text-muted);
  display: flex;
  font-size: 11px;
  gap: 12px;
  min-height: 34px;
  padding: 0 13px;
}

.audit-table-scroll { min-width: 0; overflow-x: auto; }
.audit-table { min-width: 880px; }
.audit-grid {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: 28px minmax(120px, .9fr) 90px minmax(180px, 1.4fr) 120px 150px 118px;
}

.audit-table-head {
  border-bottom: 1px solid var(--admin-border);
  color: var(--admin-text-muted);
  font-size: 11px;
  font-weight: 600;
  min-height: 38px;
  padding: 0 13px;
}

.audit-entry + .audit-entry { border-top: 1px solid var(--admin-border); }
.audit-row { min-height: 64px; padding: 9px 13px; }
.audit-row:hover { background: var(--admin-surface-sunken); }
.audit-expand-button {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 5px;
  color: var(--admin-text-muted);
  cursor: pointer;
  display: inline-flex;
  height: 26px;
  justify-content: center;
  padding: 0;
  width: 26px;
}
.audit-expand-button:hover { background: var(--admin-border); color: var(--admin-text); }
.audit-actor,
.audit-resource { display: grid; gap: 3px; min-width: 0; }
.audit-actor strong,
.audit-resource strong { color: var(--admin-text); font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit-actor small,
.audit-resource small { color: var(--admin-text-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit-action { color: var(--admin-text); font-size: 12px; }
.audit-result {
  align-items: center;
  border-radius: 6px;
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  gap: 4px;
  justify-self: start;
  min-height: 26px;
  padding: 4px 7px;
}
.audit-result.is-success { background: color-mix(in srgb, var(--admin-status-ok) 16%, transparent); color: var(--admin-status-ok); }
.audit-result.is-failure { background: color-mix(in srgb, var(--admin-status-danger) 16%, transparent); color: var(--admin-status-danger); }
.audit-row time { color: var(--admin-text-muted); font-size: 11px; }
.audit-row code { color: var(--admin-text-muted); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; }

.audit-details {
  background: var(--admin-surface-elevated);
  border-top: 1px solid var(--admin-border);
  display: grid;
  gap: 8px;
  padding: 12px 13px 12px 51px;
}
.audit-details pre {
  background: var(--admin-surface-elevated);
  border: 1px solid var(--admin-border);
  border-radius: 6px;
  color: var(--admin-text);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  line-height: 1.55;
  margin: 0;
  max-height: 300px;
  overflow: auto;
  padding: 10px 11px;
  white-space: pre-wrap;
  word-break: break-word;
}
.audit-client { color: var(--admin-text-muted); display: flex; font-size: 10px; gap: 8px; min-width: 0; }
.audit-client code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit-empty { align-items: center; color: var(--admin-text-muted); display: flex; font-size: 13px; justify-content: center; min-height: 220px; }

.audit-pagination {
  align-items: center;
  border-top: 1px solid var(--admin-border);
  color: var(--admin-text-muted);
  display: flex;
  font-size: 11px;
  justify-content: space-between;
  min-height: 50px;
  padding: 7px 12px;
}
.audit-pagination > div { display: flex; gap: 6px; }
.audit-pagination .icon-button { height: 32px; min-height: 32px; width: 32px; }
.spinning { animation: audit-spin .8s linear infinite; }
@keyframes audit-spin { to { transform: rotate(360deg); } }

@media (max-width: 1600px) {
  .audit-filter-bar { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .audit-search-field { grid-column: span 2; }
  .audit-filter-bar > input[type='datetime-local'] { grid-column: span 2; }
  .audit-filter-actions { grid-column: span 2; justify-content: flex-end; }
}

@media (max-width: 720px) {
  .audit-filter-bar { grid-template-columns: 1fr 1fr; padding: 10px; }
  .audit-search-field { grid-column: 1 / -1; }
  .audit-filter-bar > input[type='datetime-local'] { grid-column: auto; }
  .audit-filter-actions { grid-column: 1 / -1; justify-content: flex-end; }
  .audit-retention-label { display: none; }
  .audit-retention-control input { width: 64px; }
  .audit-table-scroll { overflow-x: visible; }
  .audit-table { min-width: 0; }
  .audit-table-head { display: none; }
  .audit-row {
    align-items: start;
    gap: 5px 10px;
    grid-template-areas: 'expand actor result'
      'expand resource result'
      '. action time'
      '. ip ip';
    grid-template-columns: 28px minmax(0, 1fr) auto;
    min-height: 98px;
    padding: 12px 13px;
  }
  .audit-expand-button { grid-area: expand; }
  .audit-actor { grid-area: actor; }
  .audit-action { grid-area: action; }
  .audit-resource { grid-area: resource; }
  .audit-result { grid-area: result; }
  .audit-time { align-self: center; grid-area: time; text-align: right; }
  .audit-ip { grid-area: ip; }
  .audit-details { padding: 12px 13px 12px 51px; }
}
</style>
