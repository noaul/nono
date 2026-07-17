<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Lock } from 'lucide-vue-next';
import type { Folder, Link } from '@/api/types';
import { apiRequest, jsonBody } from '@/api/client';

const props = defineProps<{ folder: Folder; username: string }>();
const emit = defineEmits<{ close: []; verified: [links: Link[]] }>();

const rootRef = ref<HTMLElement | null>(null);
const password = ref('');
const error = ref('');

async function verify() {
  error.value = '';
  try {
    const result = await apiRequest<{ verified: boolean; links: Link[] }>(
      `/api/navigation/${props.username}/folder/${props.folder.id}/verify`,
      { method: 'POST', body: jsonBody({ password: password.value }) },
    );
    if (!result.verified) {
      error.value = '密码不正确';
      return;
    }
    emit('verified', result.links);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '验证失败';
  }
}

function trapFocus(event: KeyboardEvent) {
  const modal = rootRef.value;
  if (!modal) return;
  const focusables = Array.from(
    modal.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
  if (!focusables.length) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !modal.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
    return;
  }
  if (event.key === 'Tab') trapFocus(event);
}

let lastFocused: HTMLElement | null = null;

onMounted(() => {
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  window.addEventListener('keydown', onKeydown, true);
  rootRef.value?.querySelector<HTMLElement>('input')?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
  lastFocused?.focus();
});
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <form ref="rootRef" class="modal" role="dialog" aria-modal="true" :aria-label="folder.name" tabindex="-1" @submit.prevent="verify">
      <div class="modal-head">
        <div class="modal-icon-lock">
          <Lock :size="22" />
        </div>
        <h2>{{ folder.name }}</h2>
      </div>
      <p v-if="folder.passwordHint" class="password-hint">提示：{{ folder.passwordHint }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field">
        <label>请输入文件夹密码</label>
        <input v-model="password" type="password" autofocus placeholder="••••••" />
      </div>
      <div class="toolbar modal-actions">
        <button class="button" type="submit">确认解锁</button>
        <button class="button secondary" type="button" @click="emit('close')">取消</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.modal-backdrop {
  align-items: center;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(8, 10, 14, 0.7);
  display: grid;
  inset: 0;
  padding: 24px;
  position: fixed;
  z-index: 120;
  animation: fadeIn 0.2s ease-out;
}

.modal {
  background: rgba(var(--public-card-color-rgb, 247, 248, 251), var(--public-card-opacity, 0.26));
  backdrop-filter: blur(var(--public-card-blur, 18px));
  -webkit-backdrop-filter: blur(var(--public-card-blur, 18px));
  border: 1px solid rgba(51, 65, 61, 0.2);
  border-radius: var(--public-card-radius, 8px);
  color: var(--public-bookmark-text, #ffffff);
  display: grid;
  gap: 20px;
  margin: 0 auto;
  max-width: 380px;
  padding: 28px;
  width: 100%;
  box-shadow: 0 24px 60px rgba(5, 15, 18, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon-lock {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(var(--public-folder-text-rgb, 255, 255, 255), 0.9);
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: grid;
  place-items: center;
}

.modal h2 {
  font-size: var(--public-folder-text-size, 18px);
  font-weight: 800;
  margin: 0;
  color: var(--public-folder-text, #ffffff);
}

.password-hint {
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.78);
  font-size: calc(var(--public-bookmark-text-size, 14px) - 1px);
  margin: 0;
  line-height: 1.4;
  background: rgba(255, 255, 255, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid rgba(var(--accent-rgb), 0.42);
}

.modal .field label {
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.82);
  font-size: var(--public-bookmark-text-size, 14px);
}

.modal .field input {
  background: rgba(255, 255, 255, 0.62);
  border-color: rgba(51, 65, 61, 0.22);
  color: #17211d;
}

.modal .field input::placeholder {
  color: rgba(82, 97, 92, 0.48);
}

.modal .button.secondary {
  background: rgba(255, 255, 255, 0.52);
  border-color: rgba(51, 65, 61, 0.18);
  color: #26332f;
}

.modal-actions {
  margin-top: 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.modal-actions .button {
  width: 100%;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .modal-backdrop,
  .modal {
    animation: none;
  }
}
</style>
