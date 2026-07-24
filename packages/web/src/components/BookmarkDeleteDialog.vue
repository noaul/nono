<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Trash2, X } from 'lucide-vue-next';
import type { Link } from '@/api/types';

const props = withDefaults(defineProps<{ link: Link; busy?: boolean }>(), { busy: false });
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const cancelButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;

function cancel() {
  if (!props.busy) emit('cancel');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') cancel();
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
    <section data-testid="bookmark-delete-dialog" class="bookmark-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmark-delete-title">
      <div class="bookmark-delete-icon" aria-hidden="true"><Trash2 :size="20" /></div>
      <div class="bookmark-delete-copy">
        <h2 id="bookmark-delete-title">删除书签</h2>
        <p>确定删除“{{ link.name }}”吗？此操作无法撤销。</p>
      </div>
      <button class="bookmark-delete-close" type="button" aria-label="关闭" :disabled="busy" @click="cancel">
        <X :size="17" />
      </button>
      <div class="bookmark-delete-actions">
        <button ref="cancelButton" data-testid="bookmark-delete-cancel" class="button secondary" type="button" :disabled="busy" @click="cancel">取消</button>
        <button data-testid="bookmark-delete-confirm" class="button danger" type="button" :disabled="busy" @click="emit('confirm')">
          <Trash2 :size="16" />{{ busy ? '删除中' : '确认删除' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bookmark-delete-backdrop {
  align-items: center;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(var(--public-overlay-rgb, 8, 12, 18), 0.52);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 180;
}

.bookmark-delete-dialog {
  background: rgba(var(--public-overlay-rgb, 8, 12, 18), 0.94);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.42);
  border-radius: var(--public-modal-radius, 8px);
  box-shadow: 0 24px 72px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.34);
  color: var(--public-page-text, #f3f4f6);
  display: grid;
  gap: 14px;
  grid-template-columns: 42px minmax(0, 1fr) 34px;
  max-width: 440px;
  padding: 22px;
  width: 100%;
}

.bookmark-delete-icon {
  align-items: center;
  background: rgba(244, 63, 94, 0.16);
  border: 1px solid rgba(244, 63, 94, 0.28);
  border-radius: 8px;
  color: #fb7185;
  display: flex;
  height: 42px;
  justify-content: center;
  width: 42px;
}

.bookmark-delete-copy h2,
.bookmark-delete-copy p {
  margin: 0;
}

.bookmark-delete-copy h2 {
  font-size: 18px;
  line-height: 1.35;
}

.bookmark-delete-copy p {
  color: rgba(var(--public-page-text-rgb, 243, 244, 246), 0.74);
  font-size: 14px;
  line-height: 1.65;
  margin-top: 6px;
  overflow-wrap: anywhere;
}

.bookmark-delete-close {
  align-items: center;
  align-self: start;
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.14);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.24);
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: flex;
  height: 34px;
  justify-content: center;
  padding: 0;
  width: 34px;
}

.bookmark-delete-actions {
  display: flex;
  gap: 10px;
  grid-column: 1 / -1;
  justify-content: flex-end;
  margin-top: 4px;
}

.bookmark-delete-actions .danger {
  background: #e11d48;
  color: #ffffff;
}

@media (max-width: 480px) {
  .bookmark-delete-dialog {
    grid-template-columns: 38px minmax(0, 1fr) 34px;
    padding: 18px;
  }

  .bookmark-delete-icon {
    height: 38px;
    width: 38px;
  }

  .bookmark-delete-actions .button {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bookmark-delete-backdrop {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
