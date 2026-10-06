<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { CloudUpload, Save, UploadCloud } from '@lucide/vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { BookmarkExportSnapshot } from '@/api/types';
import { notifyError, notifySuccess } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';
import { formatShanghaiDateTime } from '@/utils/dateTime';

const { t } = useI18n();
const snapshot = ref<BookmarkExportSnapshot | null>(null);
const form = reactive({ enabled: false, cadence: 'daily' as 'daily' | 'weekly', hour: 4, weekday: 1, keep: 14 });
const busy = ref<'' | 'save' | 'run'>('');
const loadFailed = ref(false);

const weekdays = computed(() => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ value: day, label: t(`exportSchedule.weekday${day}` as never) })));
const status = computed(() => snapshot.value?.status);

function apply(next: BookmarkExportSnapshot) {
  snapshot.value = next;
  Object.assign(form, next.settings);
}

async function load() {
  try {
    apply(await apiRequest<BookmarkExportSnapshot>('/api/admin/bookmark-export'));
  } catch {
    loadFailed.value = true;
  }
}

async function save() {
  busy.value = 'save';
  try {
    apply(await apiRequest<BookmarkExportSnapshot>('/api/admin/bookmark-export', { method: 'PUT', body: jsonBody({ ...form }) }));
    notifySuccess(t('exportSchedule.saved'));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('common.saveFailed'));
  } finally {
    busy.value = '';
  }
}

async function runNow() {
  busy.value = 'run';
  try {
    apply(await apiRequest<BookmarkExportSnapshot>('/api/admin/bookmark-export/run', { method: 'POST', body: jsonBody({}) }));
    notifySuccess(t('exportSchedule.exported', { file: snapshot.value?.status.lastFile || '' }));
  } catch (event) {
    notifyError(event instanceof Error ? event.message : t('exportSchedule.failed'));
    await load();
  } finally {
    busy.value = '';
  }
}

function formatDate(value: string | null | undefined) {
  return value ? formatShanghaiDateTime(value, 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : t('exportSchedule.never');
}

onMounted(load);
</script>

<template>
  <section v-if="snapshot || loadFailed" class="admin-card admin-section bookmark-export-schedule" data-testid="bookmark-export-schedule">
    <header class="admin-section-head">
      <h2><CloudUpload :size="18" /> {{ t('exportSchedule.title') }}</h2>
      <div class="admin-section-actions">
        <button class="button secondary" type="button" data-testid="run-bookmark-export" :disabled="Boolean(busy) || !status?.webDavConfigured" @click="runNow">
          <UploadCloud :size="17" /> {{ busy === 'run' ? t('exportSchedule.running') : t('exportSchedule.runNow') }}
        </button>
        <button class="button" type="button" data-testid="save-bookmark-export" :disabled="Boolean(busy) || loadFailed" @click="save">
          <Save :size="17" /> {{ busy === 'save' ? t('common.saving') : t('common.save') }}
        </button>
      </div>
    </header>
    <p v-if="loadFailed" class="export-schedule-note error">{{ t('exportSchedule.loadFailed') }}</p>
    <template v-else>
      <p v-if="!status?.webDavConfigured" class="export-schedule-note" data-testid="webdav-missing">{{ t('exportSchedule.webdavMissing') }}</p>
      <div class="admin-settings-grid">
        <label class="switch-row wide">
          <input v-model="form.enabled" data-testid="bookmark-export-enabled" type="checkbox" />
          <span><strong>{{ t('exportSchedule.enable') }}</strong><small>{{ t('exportSchedule.enableHint') }}</small></span>
        </label>
        <div class="field">
          <label for="export-cadence">{{ t('exportSchedule.cadence') }}</label>
          <select id="export-cadence" v-model="form.cadence" data-testid="bookmark-export-cadence">
            <option value="daily">{{ t('exportSchedule.daily') }}</option>
            <option value="weekly">{{ t('exportSchedule.weekly') }}</option>
          </select>
        </div>
        <div v-if="form.cadence === 'weekly'" class="field">
          <label for="export-weekday">{{ t('exportSchedule.weekday') }}</label>
          <select id="export-weekday" v-model.number="form.weekday">
            <option v-for="day in weekdays" :key="day.value" :value="day.value">{{ day.label }}</option>
          </select>
        </div>
        <div class="field">
          <label for="export-hour">{{ t('exportSchedule.hour') }}</label>
          <select id="export-hour" v-model.number="form.hour">
            <option v-for="hour in 24" :key="hour - 1" :value="hour - 1">{{ String(hour - 1).padStart(2, '0') }}:00</option>
          </select>
        </div>
        <div class="field">
          <label for="export-keep">{{ t('exportSchedule.keep') }}</label>
          <input id="export-keep" v-model.number="form.keep" type="number" min="1" max="365" />
        </div>
      </div>
      <p class="export-schedule-note" data-testid="bookmark-export-status">
        {{ t('exportSchedule.lastSuccess', { date: formatDate(status?.lastSuccessAt) }) }}
        <template v-if="status?.lastFile"> · /nono/bookmarks/{{ status.lastFile }}</template>
        <span v-if="status?.lastError" class="error"> · {{ t('exportSchedule.lastError', { error: status.lastError }) }}</span>
      </p>
    </template>
  </section>
</template>

<style scoped>
.export-schedule-note {
  color: var(--ui-text-muted);
  font-size: 12px;
  margin: 0;
}

.export-schedule-note.error,
.export-schedule-note .error {
  color: var(--ui-danger, #dc2626);
}

.bookmark-export-schedule .wide {
  grid-column: 1 / -1;
}
</style>
