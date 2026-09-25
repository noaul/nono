import { ref, type Ref } from 'vue';

export type DropSide = 'before' | 'after' | '';

export type PointerDragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

type PointerDragOptions<T extends PointerDragState> = {
  /** Re-reads the drop target under the pointer and writes it onto the live drag state. */
  resolve: (drag: T, clientX: number, clientY: number) => void;
  /** Receives a snapshot of the finished drag once the listeners are already gone. */
  drop: (drag: T) => void | Promise<void>;
  /** Runs whenever a drag ends, whether it was dropped or cancelled. */
  onFinish?: () => void;
};

/**
 * The shared lifecycle behind every homepage drag: window-level pointer tracking (so a drag keeps
 * going when the pointer leaves the element it started on), a body class that disables text
 * selection, and a clean teardown on drop or cancel. Each kind of drag only supplies how it finds
 * a target and what a drop saves.
 */
export function usePointerDrag<T extends PointerDragState>(options: PointerDragOptions<T>) {
  const drag = ref(null) as Ref<T | null>;

  function track(clientX: number, clientY: number) {
    const current = drag.value;
    if (!current) return;
    current.clientX = clientX;
    current.clientY = clientY;
    options.resolve(current, clientX, clientY);
  }

  function onMove(event: PointerEvent) {
    if (!drag.value || event.pointerId !== drag.value.pointerId) return;
    event.preventDefault();
    track(event.clientX, event.clientY);
  }

  function onEnd(event: PointerEvent) {
    const current = drag.value;
    if (!current || event.pointerId !== current.pointerId) return;
    track(event.clientX, event.clientY);
    const completed = { ...current };
    finish();
    void options.drop(completed);
  }

  function finish() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', cancel);
    document.body.classList.remove('organize-dragging');
    drag.value = null;
    options.onFinish?.();
  }

  function start(initial: T) {
    drag.value = initial;
    document.body.classList.add('organize-dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', cancel);
    track(initial.clientX, initial.clientY);
  }

  function cancel() {
    if (drag.value) finish();
  }

  /** Re-resolves at the last known position, for when the page changed under a still pointer. */
  function retarget() {
    if (drag.value) track(drag.value.clientX, drag.value.clientY);
  }

  return { drag, start, cancel, retarget };
}

/** Where an item lands in `items` when dropped on the given side of `targetId` (the end if none). */
export function insertionIndex<T extends { id: number }>(items: T[], targetId: number | null, side: DropSide) {
  if (!targetId) return items.length;
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return items.length;
  return Math.min(items.length, targetIndex + (side === 'after' ? 1 : 0));
}

/** Rewrites `sortOrder` so the array order survives a reload; higher sorts first. */
export function applySortOrder<T extends { sortOrder: number }>(items: T[]) {
  items.forEach((item, index) => {
    item.sortOrder = (items.length - index) * 10;
  });
}

export function sameOrder<T extends { id: number }>(left: T[], right: T[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id);
}
