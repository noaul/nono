import { readonly, ref } from 'vue';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary';
}

interface ConfirmState extends Required<ConfirmOptions> {
  open: boolean;
}

const defaultState: ConfirmState = {
  open: false,
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  tone: 'primary',
};

const state = ref<ConfirmState>({ ...defaultState });
let resolver: ((value: boolean) => void) | null = null;

export function useConfirm() {
  function settle(value: boolean) {
    if (resolver) resolver(value);
    resolver = null;
    state.value = { ...state.value, open: false };
  }

  function confirm(options: ConfirmOptions) {
    if (resolver) resolver(false);
    state.value = {
      open: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || '确认',
      cancelText: options.cancelText || '取消',
      tone: options.tone || 'primary',
    };
    return new Promise<boolean>((resolve) => {
      resolver = resolve;
    });
  }

  return {
    state: readonly(state),
    confirm,
    accept: () => settle(true),
    cancel: () => settle(false),
  };
}

export function clearConfirmState() {
  if (resolver) resolver(false);
  resolver = null;
  state.value = { ...defaultState };
}
