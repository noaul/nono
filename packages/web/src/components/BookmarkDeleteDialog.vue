<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Trash2, X } from 'lucide-vue-next';
import type { Link } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const props = withDefaults(defineProps<{
  link?: Link;
  label?: string;
  kind?: 'bookmark' | 'folder' | 'notab';
  busy?: boolean;
}>(), { label: '', kind: 'bookmark', busy: false });
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const { t } = useI18n();
const dialog = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;
const displayLabel = computed(() => props.label || props.link?.name || t('deleteDialog.untitled'));
const kindLabel = computed(() => props.kind === 'bookmark' ? t('nav.kindBookmark') : props.kind === 'folder' ? t('nav.kindFolder') : t('nav.kindNotab'));

function cancel() {
  if (!props.busy) emit('cancel');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    cancel();
    return;
  }
  if (event.key !== 'Tab' || !dialog.value) return;
  const focusable = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  window.addEventListener('keydown', onKeydown);
  await nextTick();
  cancelButton.value?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  previousFocus?.focus();
});
</script>

<template>
  <div class="bookmark-delete-backdrop" role="presentation" @pointerdown.self="cancel">
    <section ref="dialog" data-testid="bookmark-delete-dialog" class="bookmark-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmark-delete-title" tabindex="-1">
      <div class="bookmark-delete-icon" aria-hidden="true"><Trash2 :size="20" /></div>
      <div class="bookmark-delete-copy">
        <h2 id="bookmark-delete-title">{{ t('deleteDialog.title', { kind: kindLabel }) }}</h2>
        <p>{{ t('deleteDialog.questionPrefix') }}<strong>“{{ displayLabel }}”</strong>{{ t('deleteDialog.questionSuffix') }}</p>
      </div>
      <button class="bookmark-delete-close" type="button" :aria-label="t('common.close')" :disabled="busy" @click="cancel">
        <X :size="17" />
      </button>
      <div class="bookmark-delete-actions">
        <button ref="cancelButton" data-testid="bookmark-delete-cancel" class="bookmark-delete-button bookmark-delete-cancel" type="button" :disabled="busy" @click="cancel">{{ t('common.cancel') }}</button>
        <button data-testid="bookmark-delete-confirm" class="bookmark-delete-button bookmark-delete-confirm" type="button" :disabled="busy" @click="emit('confirm')">
          <Trash2 :size="16" />{{ busy ? t('deleteDialog.deleting') : t('deleteDialog.confirmDelete') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bookmark-delete-backdrop {
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  background: rgba(var(--public-overlay-rgb, 8, 12, 18), 0.36);
  display: grid;
  inset: 0;
  place-items: center;
  padding: 20px;
  position: fixed;
  z-index: 180;
  animation: bookmark-delete-fade 0.2s ease-out both;
}

.bookmark-delete-dialog {
  backdrop-filter: blur(calc(var(--public-card-blur, 18px) + 8px)) saturate(1.2);
  -webkit-backdrop-filter: blur(calc(var(--public-card-blur, 18px) + 8px)) saturate(1.2);
  background: rgba(var(--public-card-color-rgb, 247, 248, 251), calc(var(--public-card-opacity, 0.26) + 0.36));
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.48);
  border-radius: var(--public-card-radius, 8px);
  box-shadow:
    0 24px 64px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.26),
    inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), 0.5);
  color: var(--public-page-text, #f3f4f6);
  display: grid;
  gap: 16px;
  grid-template-columns: 40px minmax(0, 1fr) 32px;
  padding: 20px;
  width: min(100%, 420px);
  animation: bookmark-delete-pop 0.3s var(--nono-ease-spring, cubic-bezier(0.34, 1.36, 0.44, 1)) both;
}

.bookmark-delete-icon {
  align-items: center;
  background: rgba(244, 63, 94, 0.12);
  border: 1px solid rgba(244, 63, 94, 0.26);
  border-radius: 8px;
  color: #e11d48;
  display: flex;
  height: 40px;
  justify-content: center;
  width: 40px;
}

.bookmark-delete-copy h2,
.bookmark-delete-copy p {
  margin: 0;
}

.bookmark-delete-copy h2 {
  color: var(--public-page-text, #f3f4f6);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.3;
}

.bookmark-delete-copy p {
  color: rgba(var(--public-page-text-rgb, 243, 244, 246), 0.72);
  font-size: 13px;
  line-height: 1.55;
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.bookmark-delete-copy strong {
  color: var(--public-page-text, #f3f4f6);
  font-weight: 750;
}

.bookmark-delete-close {
  align-items: center;
  align-self: start;
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.12);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.22);
  border-radius: 8px;
  color: rgba(var(--public-page-text-rgb, 243, 244, 246), 0.68);
  cursor: pointer;
  display: flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
  width: 32px;
}

.bookmark-delete-close:hover,
.bookmark-delete-close:focus-visible {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.24);
  border-color: rgba(var(--public-border-rgb, 255, 255, 255), 0.38);
  color: var(--public-page-text, #f3f4f6);
  outline: none;
}

.bookmark-delete-close:active {
  transform: scale(0.94);
}

.bookmark-delete-actions {
  display: grid;
  gap: 10px;
  grid-column: 1 / -1;
  grid-template-columns: 1fr 1fr;
  margin-top: 2px;
}

.bookmark-delete-button {
  align-items: center;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 13px;
  font-weight: 750;
  gap: 7px;
  height: 40px;
  justify-content: center;
  min-width: 0;
  padding: 0 14px;
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.bookmark-delete-cancel {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.16);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.3);
  color: var(--public-page-text, #f3f4f6);
}

.bookmark-delete-cancel:hover,
.bookmark-delete-cancel:focus-visible {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.28);
  border-color: rgba(var(--public-border-rgb, 255, 255, 255), 0.46);
  outline: none;
}

.bookmark-delete-confirm {
  background: rgba(225, 29, 72, 0.14);
  border: 1px solid rgba(225, 29, 72, 0.3);
  color: #be123c;
}

.bookmark-delete-confirm:hover,
.bookmark-delete-confirm:focus-visible {
  background: #e11d48;
  border-color: #e11d48;
  box-shadow: 0 8px 20px rgba(190, 18, 60, 0.2);
  color: #ffffff;
  outline: none;
}

:global([data-color-mode='dark']) .bookmark-delete-icon,
:global([data-color-mode='dark']) .bookmark-delete-confirm {
  color: #fb7185;
}

:global([data-color-mode='dark']) .bookmark-delete-confirm:hover,
:global([data-color-mode='dark']) .bookmark-delete-confirm:focus-visible {
  color: #ffffff;
}

.bookmark-delete-button:active {
  transform: scale(0.98);
}

.bookmark-delete-button:disabled,
.bookmark-delete-close:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

@keyframes bookmark-delete-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes bookmark-delete-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 480px) {
  .bookmark-delete-dialog {
    gap: 13px;
    grid-template-columns: 38px minmax(0, 1fr) 32px;
    padding: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bookmark-delete-backdrop,
  .bookmark-delete-dialog {
    animation: none;
  }
}
</style>
