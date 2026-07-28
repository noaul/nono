<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next';
import { useToasts } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const { toasts, dismiss } = useToasts();

function iconFor(tone: string) {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'error') return XCircle;
  return Info;
}
</script>

<template>
  <div class="toast-stack" aria-live="polite" aria-atomic="true">
    <article v-for="toast in toasts" :key="toast.id" class="admin-toast" :class="`admin-toast-${toast.tone}`">
      <component :is="iconFor(toast.tone)" :size="18" />
      <span>{{ toast.message }}</span>
      <button class="toast-dismiss" type="button" :aria-label="t('ui.dismissToast')" @click="dismiss(toast.id)">
        <X :size="15" />
      </button>
    </article>
  </div>
</template>
