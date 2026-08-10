<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next';
import { useToasts, type AdminToast, type ToastAction } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const { toasts, dismiss } = useToasts();

function actionsFor(toast: AdminToast): readonly ToastAction[] {
  if (toast.actions?.length) return toast.actions;
  return toast.action && toast.actionLabel ? [{ label: toast.actionLabel, action: toast.action }] : [];
}

async function runAction(toast: AdminToast, action: ToastAction) {
  try {
    await action.action();
  } finally {
    dismiss(toast.id);
  }
}

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
      <span v-if="actionsFor(toast).length" class="toast-actions">
        <button v-for="action in actionsFor(toast)" :key="action.label" class="toast-action" type="button" @click="runAction(toast, action)">
          {{ action.label }}
        </button>
      </span>
      <button class="toast-dismiss" type="button" :aria-label="t('ui.dismissToast')" @click="dismiss(toast.id)">
        <X :size="15" />
      </button>
    </article>
  </div>
</template>
