<script setup lang="ts">
import { computed } from 'vue';
import { Wrench } from 'lucide-vue-next';
import type { LinkHealthResult, LinkHealthSummary } from '@/api/types';

const props = defineProps<{ summary: LinkHealthSummary | null; results: LinkHealthResult[]; isRepairing?: boolean }>();
const emit = defineEmits<{ repair: [ids: number[]] }>();
const repairableIds = computed(() => props.results.filter((result) => result.status === 'redirected' && result.finalUrl).map((result) => result.id));

function healthStatusLabel(status: LinkHealthResult['status']) {
  if (status === 'ok') return '正常';
  if (status === 'redirected') return '重定向';
  if (status === 'restricted') return '访问受限';
  if (status === 'broken') return '异常';
  if (status === 'timeout') return '超时';
  return '无效';
}
</script>

<template>
  <div v-if="summary" class="health-check-panel">
    <div class="health-check-head">
      <h3>健康检查</h3>
      <div class="health-check-actions">
        <span>{{ summary.total }} 个链接</span>
        <button
          v-if="repairableIds.length"
          class="button secondary"
          data-testid="repair-link-redirects"
          type="button"
          :disabled="isRepairing"
          @click="emit('repair', repairableIds)"
        >
          <Wrench :size="15" /> {{ isRepairing ? '修复中' : `修复重定向 ${repairableIds.length}` }}
        </button>
      </div>
    </div>
    <div class="health-summary">
      <span>正常 {{ summary.ok }}</span>
      <span>重定向 {{ summary.redirected }}</span>
      <span>访问受限 {{ summary.restricted }}</span>
      <span>异常 {{ summary.broken }}</span>
      <span>超时 {{ summary.timeout }}</span>
      <span>无效 {{ summary.invalid }}</span>
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
