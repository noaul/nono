import { readonly, ref } from 'vue';

export type ToastTone = 'success' | 'error' | 'info';

export interface AdminToast {
  id: number;
  tone: ToastTone;
  message: string;
  actionLabel?: string;
  action?: () => void | Promise<void>;
  actions?: readonly ToastAction[];
}

export interface ToastAction {
  label: string;
  action: () => void | Promise<void>;
}

export interface ToastOptions {
  duration?: number;
  actionLabel?: string;
  action?: () => void | Promise<void>;
  actions?: readonly ToastAction[];
}

const toasts = ref<AdminToast[]>([]);
let nextToastId = 1;

export function useToasts() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function push(message: string, tone: ToastTone = 'info', options: number | ToastOptions = 4000) {
    const normalized = typeof options === 'number' ? { duration: options } : options;
    const toast: AdminToast = {
      id: nextToastId,
      tone,
      message,
      ...(normalized.actionLabel ? { actionLabel: normalized.actionLabel } : {}),
      ...(normalized.action ? { action: normalized.action } : {}),
      ...(normalized.actions?.length ? { actions: normalized.actions } : {}),
    };
    nextToastId += 1;
    toasts.value = [...toasts.value, toast];
    const duration = normalized.duration ?? 4000;
    if (duration > 0) window.setTimeout(() => dismiss(toast.id), duration);
    return toast.id;
  }

  return { toasts: readonly(toasts), push, dismiss };
}

export function notifySuccess(message: string, options?: ToastOptions) {
  return useToasts().push(message, 'success', options);
}

export function notifyError(message: string) {
  return useToasts().push(message, 'error');
}

export function clearToasts() {
  toasts.value = [];
}
