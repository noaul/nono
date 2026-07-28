<script setup lang="ts">
import { useI18n } from '@/composables/useI18n';
defineProps<{
  label?: string;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="loading-overlay" role="status" aria-live="polite">
    <span class="loading-spinner" aria-hidden="true"></span>
    <span>{{ label || t('ui.loading') }}</span>
  </div>
</template>
