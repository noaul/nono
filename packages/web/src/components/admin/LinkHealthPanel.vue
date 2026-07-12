<script setup lang="ts">
import type { LinkHealthResult, LinkHealthSummary } from '@/api/types';

defineProps<{ summary: LinkHealthSummary | null; results: LinkHealthResult[] }>();

function healthStatusLabel(status: LinkHealthResult['status']) {
  if (status === 'ok') return '正常';
  if (status === 'broken') return '异常';
  if (status === 'timeout') return '超时';
  return '无效';
}
</script>

<template>
  <div v-if="summary" class="health-check-panel">
    <div class="health-check-head">
      <h3>健康检查</h3>
      <span>{{ summary.total }} 个链接</span>
    </div>
    <div class="health-summary">
      <span>正常 {{ summary.ok }}</span>
      <span>异常 {{ summary.broken }}</span>
      <span>超时 {{ summary.timeout }}</span>
      <span>无效 {{ summary.invalid }}</span>
    </div>
    <div class="health-result-list">
      <div v-for="result in results" :key="result.id" class="health-result-row" :class="`status-${result.status}`">
        <strong>{{ result.name }}</strong>
        <span>{{ result.url }}</span>
        <small>{{ healthStatusLabel(result.status) }}{{ result.statusCode ? ` · ${result.statusCode}` : '' }}{{ result.reason ? ` · ${result.reason}` : '' }}</small>
      </div>
    </div>
  </div>
</template>
