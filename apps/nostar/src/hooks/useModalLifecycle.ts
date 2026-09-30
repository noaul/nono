import { useEffect, useRef, useState, type RefObject } from 'react';

interface ModalEntry { token: symbol; dialog: HTMLElement }
const modalStack: ModalEntry[] = [];
let originalOverflow = '';
let nextLayer = 100;
const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

/** Share focus, scroll locking and Escape ownership across every dialog and image preview. */
export function useModalLifecycle(isOpen: boolean, onClose: () => void, dialogRef: RefObject<HTMLElement | null>): number {
  const closeRef = useRef(onClose);
  const [layer, setLayer] = useState(100);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const token = Symbol('modal');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!modalStack.length) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      nextLayer = 100;
    }
    modalStack.push({token, dialog});
    setLayer(nextLayer += 10);
    const isTop = () => modalStack[modalStack.length - 1]?.token === token;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => {
      if (element.matches(':disabled') || (element.hasAttribute('tabindex') && element.tabIndex < 0) || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const closedDetails = element.closest('details:not([open])');
      if (closedDetails && !closedDetails.querySelector(':scope > summary')?.contains(element)) return false;
      for (let current: HTMLElement | null = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (current === dialog) break;
      }
      return true;
    });
    (focusables()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (!isTop() || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const items = focusables();
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    const keepFocus = (event: FocusEvent) => {
      if (isTop() && !dialog.contains(event.target as Node)) (focusables()[0] ?? dialog).focus();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', keepFocus);
    return () => {
      const wasTop = isTop();
      const index = modalStack.findIndex(entry => entry.token === token);
      if (index >= 0) modalStack.splice(index, 1);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', keepFocus);
      if (!modalStack.length) document.body.style.overflow = originalOverflow;
      if (wasTop) {
        if (opener?.isConnected) opener.focus();
        else modalStack[modalStack.length - 1]?.dialog.focus();
      }
    };
  }, [isOpen, dialogRef]);
  return layer;
}
