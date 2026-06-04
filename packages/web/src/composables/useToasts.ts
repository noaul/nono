import { readonly, ref } from 'vue';

export type ToastTone = 'success' | 'error' | 'info';

export interface AdminToast {
  id: number;
  tone: ToastTone;
  message: string;
}

const toasts = ref<AdminToast[]>([]);
let nextToastId = 1;

export function useToasts() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function push(message: string, tone: ToastTone = 'info', duration = 4000) {
    const toast = { id: nextToastId, tone, message };
    nextToastId += 1;
    toasts.value = [...toasts.value, toast];
    if (duration > 0) window.setTimeout(() => dismiss(toast.id), duration);
    return toast.id;
  }

  return { toasts: readonly(toasts), push, dismiss };
}

export function notifySuccess(message: string) {
  return useToasts().push(message, 'success');
}

export function notifyError(message: string) {
  return useToasts().push(message, 'error');
}

export function clearToasts() {
  toasts.value = [];
}
