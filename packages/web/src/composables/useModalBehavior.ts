import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let bodyLockDepth = 0;
let originalBodyOverflow = '';

function lockBodyScroll() {
  if (bodyLockDepth === 0) originalBodyOverflow = document.body.style.overflow;
  bodyLockDepth += 1;
  document.body.style.overflow = 'hidden';
}

function unlockBodyScroll() {
  if (bodyLockDepth === 0) return;
  bodyLockDepth -= 1;
  if (bodyLockDepth === 0) document.body.style.overflow = originalBodyOverflow;
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
}

export function useModalBehavior(options: {
  open: Readonly<Ref<boolean>>;
  container: Readonly<Ref<HTMLElement | null>>;
  close: () => void;
  initialFocus?: () => HTMLElement | null;
}) {
  let mounted = false;
  let active = false;
  let previousFocus: HTMLElement | null = null;

  function trapFocus(event: KeyboardEvent) {
    const container = options.container.value;
    if (!container) return;
    const focusable = focusableElements(container);
    if (!focusable.length) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (!container.contains(current)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      options.close();
    } else if (event.key === 'Tab') {
      trapFocus(event);
    }
  }

  function activate() {
    if (active) return;
    active = true;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();
    window.addEventListener('keydown', onKeydown, true);
    const container = options.container.value;
    (options.initialFocus?.() || (container ? focusableElements(container)[0] : null) || container)?.focus();
  }

  function deactivate(restoreFocus = true) {
    if (!active) return;
    active = false;
    window.removeEventListener('keydown', onKeydown, true);
    unlockBodyScroll();
    if (!restoreFocus) return;
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  watch(options.open, (opened) => {
    if (!mounted) return;
    if (opened) activate();
    else deactivate();
  }, { flush: 'post' });

  onMounted(() => {
    mounted = true;
    if (options.open.value) activate();
  });

  onBeforeUnmount(() => {
    mounted = false;
    if (!active) return;
    const restoreTarget = previousFocus;
    deactivate(false);
    if (restoreTarget?.isConnected) restoreTarget.focus();
  });
}
