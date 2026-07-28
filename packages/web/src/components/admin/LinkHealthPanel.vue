<script setup lang="ts">
import { computed } from 'vue';
import { Wrench } from 'lucide-vue-next';
import type { LinkHealthResult, LinkHealthSummary } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const props = defineProps<{ summary: LinkHealthSummary | null; results: LinkHealthResult[]; isRepairing?: boolean }>();
const emit = defineEmits<{ repair: [ids: number[]] }>();
const repairableIds = computed(() => props.results.filter((result) => result.status === 'redirected' && result.finalUrl).map((result) => result.id));

function healthStatusLabel(status: LinkHealthResult['status']) {
  if (status === 'ok') return t('health.ok');
  if (status === 'redirected') return t('health.redirected');
  if (status === 'restricted') return t('health.restricted');
  if (status === 'broken') return t('health.broken');
  if (status === 'timeout') return t('health.timeout');
  return t('health.invalid');
}
</script>

<template>
  <div v-if="summary" class="health-check-panel">
    <div class="health-check-head">
      <h3>{{ t('health.title') }}</h3>
      <div class="health-check-actions">
        <span>{{ t('health.linkCount', { count: summary.total }) }}</span>
        <button
          v-if="repairableIds.length"
          class="button secondary"
          data-testid="repair-link-redirects"
          type="button"
          :disabled="isRepairing"
          @click="emit('repair', repairableIds)"
        >
          <Wrench :size="15" /> {{ isRepairing ? t('health.repairing') : t('health.repairRedirects', { count: repairableIds.length }) }}
        </button>
      </div>
    </div>
    <div class="health-summary">
      <span>{{ t('health.countOk', { count: summary.ok }) }}</span>
      <span>{{ t('health.countRedirected', { count: summary.redirected }) }}</span>
      <span>{{ t('health.countRestricted', { count: summary.restricted }) }}</span>
      <span>{{ t('health.countBroken', { count: summary.broken }) }}</span>
      <span>{{ t('health.countTimeout', { count: summary.timeout }) }}</span>
      <span>{{ t('health.countInvalid', { count: summary.invalid }) }}</span>
    </div>
    <div class="health-result-list">
      <div v-for="result in results" :key="result.id" class="health-result-row" :class="`status-${result.status}`">
        <strong>{{ result.name }}</strong>
        <div class="health-url-stack">
          <span>{{ result.url }}</span>
          <span v-if="result.finalUrl" class="health-final-url">{{ result.finalUrl }}</span>
        </div>
        <small :title="result.checkedAt">{{ healthStatusLabel(result.status) }}{{ result.statusCode ? ` · ${result.statusCode}` : '' }}{{ result.reason ? ` · ${result.reason}` : '' }}</small>
      </div>
    </div>
  </div>
</template>
