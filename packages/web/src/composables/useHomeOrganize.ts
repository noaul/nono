import { computed, nextTick, onUnmounted, ref, type Ref } from 'vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Folder, Link, NavigationPayload } from '@/api/types';
import type { useI18n } from '@/composables/useI18n';
import { applySortOrder, insertionIndex, sameOrder, usePointerDrag, type DropSide, type PointerDragState } from '@/composables/usePointerDrag';

/**
 * The owner's organize mode on the homepage: holding All arms it, then NoTabs, folders and
 * bookmarks can be dragged into a new order or another parent, and anything can be sent to the
 * recycle bin. Every change is applied to the page first and rolled back if the save fails.
 */
export function useHomeOrganize(options: {
  payload: Ref<NavigationPayload | null>;
  canOrganize: Ref<boolean>;
  selectedCategoryId: Ref<string>;
  categoryFolders: Ref<Folder[]>;
  /** Whether a dialog the page owns (not the delete confirmation) is open. */
  otherModalOpen: () => boolean;
  selectCategory: (id: string) => void;
  resetFolderBatch: () => void;
  renderAllFolders: () => void;
  updateTabIndicator: () => void;
  reload: () => Promise<unknown>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const { payload, canOrganize, selectedCategoryId, categoryFolders, t } = options;

  const pendingDelete = ref<{
    kind: 'bookmark' | 'folder' | 'notab';
    id: number;
    label: string;
    link?: Link;
    folderId?: number;
  } | null>(null);
  const deletingItem = ref(false);
  const movingBookmark = ref(false);
  const movingFolder = ref(false);
  const movingNotab = ref(false);
  const organizing = ref(false);
  const organizeArming = ref(false);
  const bookmarkMessage = ref<{ kind: 'error' | 'success'; text: string } | null>(null);
  type BookmarkDragState = PointerDragState & {
    link: Link;
    sourceFolderId: number;
    targetFolderId: number | null;
    targetLinkId: number | null;
    targetSide: DropSide;
  };
  type FolderDragState = PointerDragState & {
    folder: Folder;
    sourceParentId: number | null;
    targetParentId: number | null;
    targetFolderId: number | null;
    targetSide: DropSide;
  };
  type NotabDragState = PointerDragState & {
    folder: Folder;
    targetNotabId: number | null;
    targetSide: DropSide;
  };
  const {
    drag: bookmarkDrag,
    start: startBookmarkDrag,
    cancel: cancelBookmarkDrag,
    retarget: retargetBookmarkDrag,
  } = usePointerDrag<BookmarkDragState>({
    resolve: resolveBookmarkTarget,
    drop: (drag) => {
      suppressPostDragClick();
      return persistBookmarkDrop(drag);
    },
    onFinish: clearNotabHover,
  });
  const {
    drag: folderDrag,
    start: startFolderDrag,
    cancel: cancelFolderDrag,
    retarget: retargetFolderDrag,
  } = usePointerDrag<FolderDragState>({ resolve: resolveFolderTarget, drop: persistFolderDrop, onFinish: clearNotabHover });
  const { drag: notabDrag, start: startNotabDrag, cancel: cancelNotabDrag } = usePointerDrag<NotabDragState>({
    resolve: resolveNotabTarget,
    drop: persistNotabDrop,
  });
  let organizePressTimer: ReturnType<typeof setTimeout> | undefined;
  let organizePress: { pointerId: number; startX: number; startY: number; element: HTMLElement } | null = null;
  let suppressTabClick = false;
  let notabHoverTimer: ReturnType<typeof setTimeout> | undefined;
  let hoveredNotabId: string | null = null;
  let bookmarkMessageTimer: ReturnType<typeof setTimeout> | undefined;
  let postDragClickTimer: ReturnType<typeof setTimeout> | undefined;
  let postDragClickHandler: ((event: MouseEvent) => void) | null = null;
  const anyModalOpen = computed(() => options.otherModalOpen() || Boolean(pendingDelete.value));
  const anyDragActive = computed(() => Boolean(bookmarkDrag.value || folderDrag.value || notabDrag.value));
  const dragPreview = computed(() => {
    if (bookmarkDrag.value) return { kind: 'bookmark' as const, label: bookmarkDrag.value.link.name, x: bookmarkDrag.value.clientX, y: bookmarkDrag.value.clientY };
    if (folderDrag.value) return { kind: 'folder' as const, label: folderDrag.value.folder.name, x: folderDrag.value.clientX, y: folderDrag.value.clientY };
    if (notabDrag.value) return { kind: 'notab' as const, label: notabDrag.value.folder.name, x: notabDrag.value.clientX, y: notabDrag.value.clientY };
    return null;
  });

  function stopOrganizePress() {
    clearTimeout(organizePressTimer);
    organizePressTimer = undefined;
    if (organizePress?.element.hasPointerCapture?.(organizePress.pointerId)) {
      organizePress.element.releasePointerCapture(organizePress.pointerId);
    }
    organizePress = null;
    organizeArming.value = false;
  }

  function enterOrganizeMode() {
    if (!canOrganize.value) return;
    organizing.value = true;
    selectedCategoryId.value = 'all';
    options.renderAllFolders();
    suppressTabClick = true;
    stopOrganizePress();
    void nextTick(options.updateTabIndicator);
  }

  function exitOrganizeMode() {
    stopOrganizePress();
    cancelAllDrags();
    organizing.value = false;
    suppressTabClick = false;
    void nextTick(options.updateTabIndicator);
  }

  function onNotabPointerDown(tabId: string, event: PointerEvent) {
    if (event.button !== 0 || !canOrganize.value) return;
    if (organizing.value) {
      if (tabId !== 'all') onNotabDragStart(Number(tabId), event);
      return;
    }
    if (tabId !== 'all' || organizePress) return;
    const element = event.currentTarget;
    if (!(element instanceof HTMLElement)) return;
    organizePress = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, element };
    organizeArming.value = true;
    element.setPointerCapture?.(event.pointerId);
    organizePressTimer = setTimeout(enterOrganizeMode, 1000);
  }

  function onNotabPointerMove(event: PointerEvent) {
    if (!organizePress || organizePress.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - organizePress.startX, event.clientY - organizePress.startY) > 10) stopOrganizePress();
  }

  function onNotabPointerEnd(event: PointerEvent) {
    if (organizePress?.pointerId === event.pointerId) stopOrganizePress();
  }

  function onNotabClick(tabId: string, event: MouseEvent) {
    if (suppressTabClick || (organizing.value && tabId !== 'all')) {
      event.preventDefault();
      suppressTabClick = false;
      return;
    }
    options.selectCategory(tabId);
  }

  function findFolder(folderId: number) {
    return payload.value?.folders.find((folder) => folder.id === folderId);
  }

  function showBookmarkMessage(kind: 'error' | 'success', text: string) {
    bookmarkMessage.value = { kind, text };
    clearTimeout(bookmarkMessageTimer);
    bookmarkMessageTimer = setTimeout(() => {
      bookmarkMessage.value = null;
    }, 3200);
  }

  function requestBookmarkDelete(request: { link: Link; folderId: number }) {
    if (!canOrganize.value || anyDragActive.value) return;
    pendingDelete.value = { kind: 'bookmark', id: request.link.id, label: request.link.name, link: request.link, folderId: request.folderId };
  }

  function requestFolderDelete(folder: Folder) {
    if (!organizing.value || !canOrganize.value || anyDragActive.value) return;
    pendingDelete.value = {
      kind: folder.parentId ? 'folder' : 'notab',
      id: folder.id,
      label: folder.name,
    };
  }

  function requestNotabDelete(folderId: number) {
    const folder = findFolder(folderId);
    if (folder) requestFolderDelete(folder);
  }

  async function confirmItemDelete() {
    const request = pendingDelete.value;
    if (!request || deletingItem.value || !canOrganize.value) return;
    deletingItem.value = true;
    try {
      const path = request.kind === 'bookmark' ? `/api/admin/links/${request.id}` : `/api/admin/folders/${request.id}`;
      await apiRequest(path, { method: 'DELETE' });
      if (request.kind === 'bookmark') {
        const folder = request.folderId ? findFolder(request.folderId) : null;
        if (folder) folder.links = (folder.links || []).filter((link) => link.id !== request.id);
      } else if (payload.value) {
        const removedIds = collectFolderTreeIds(request.id);
        payload.value.folders = payload.value.folders.filter((folder) => !removedIds.has(folder.id));
        if (request.kind === 'notab' && selectedCategoryId.value === String(request.id)) selectedCategoryId.value = 'all';
      }
      pendingDelete.value = null;
      showBookmarkMessage('success', t('nav.trashed', {
        kind: request.kind === 'bookmark' ? t('nav.kindBookmark') : request.kind === 'folder' ? t('nav.kindFolder') : t('nav.kindNotab'),
      }));
    } catch (error) {
      showBookmarkMessage('error', error instanceof Error ? error.message : t('nav.deleteFailed'));
    } finally {
      deletingItem.value = false;
    }
  }

  function collectFolderTreeIds(rootId: number) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of payload.value?.folders || []) {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  function clearNotabHover() {
    clearTimeout(notabHoverTimer);
    notabHoverTimer = undefined;
    hoveredNotabId = null;
  }

  function scheduleNotabSwitch(notabId: string) {
    if (notabId === selectedCategoryId.value) return false;
    if (hoveredNotabId !== notabId) {
      clearNotabHover();
      hoveredNotabId = notabId;
      notabHoverTimer = setTimeout(async () => {
        if ((!bookmarkDrag.value && !folderDrag.value) || hoveredNotabId !== notabId) return;
        selectedCategoryId.value = notabId;
        options.resetFolderBatch();
        clearNotabHover();
        await nextTick();
        options.updateTabIndicator();
        retargetBookmarkDrag();
        retargetFolderDrag();
      }, 600);
    }
    return true;
  }

  /** Holding a drag over another NoTab switches to it after a pause; until then nothing is a target. */
  function hoverNotab(element: Element | null) {
    const notabId = element?.closest<HTMLElement>('[data-notab-id]')?.dataset.notabId;
    if (notabId && scheduleNotabSwitch(notabId)) return true;
    clearNotabHover();
    return false;
  }

  function sideOf(rect: DOMRect, clientX: number): DropSide {
    return clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  }

  function resolveBookmarkTarget(drag: BookmarkDragState, clientX: number, clientY: number) {
    const target = findBookmarkTarget(drag.link.id, clientX, clientY);
    drag.targetFolderId = target?.folderId ?? null;
    drag.targetLinkId = target?.linkId ?? null;
    drag.targetSide = target?.side ?? '';
  }

  function findBookmarkTarget(linkId: number, clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    if (hoverNotab(element)) return null;

    const folderPanel = element?.closest<HTMLElement>('[data-drop-folder-id]');
    const folderId = Number(folderPanel?.dataset.dropFolderId);
    const folder = Number.isInteger(folderId) ? findFolder(folderId) : null;
    if (!folderPanel || !folder || folder.locked) return null;

    const bookmark = element?.closest<HTMLElement>('[data-bookmark-id]');
    const bookmarkId = Number(bookmark?.dataset.bookmarkId);
    if (bookmarkId === linkId) return null;
    if (!bookmark || !Number.isInteger(bookmarkId)) return { folderId, linkId: null, side: '' as DropSide };
    return { folderId, linkId: bookmarkId, side: sideOf(bookmark.getBoundingClientRect(), clientX) };
  }

  function onBookmarkDragStart(request: { link: Link; folderId: number; pointerId: number; clientX: number; clientY: number }) {
    if (!canOrganize.value || anyModalOpen.value || anyDragActive.value || movingBookmark.value) return;
    startBookmarkDrag({
      link: request.link,
      sourceFolderId: request.folderId,
      pointerId: request.pointerId,
      clientX: request.clientX,
      clientY: request.clientY,
      targetFolderId: null,
      targetLinkId: null,
      targetSide: '',
    });
  }

  async function persistBookmarkDrop(drag: BookmarkDragState) {
    const sourceFolder = findFolder(drag.sourceFolderId);
    const targetFolder = drag.targetFolderId ? findFolder(drag.targetFolderId) : null;
    if (!sourceFolder || !targetFolder || targetFolder.locked) return;

    const sourceBefore = [...(sourceFolder.links || [])];
    const targetBefore = sourceFolder.id === targetFolder.id ? sourceBefore : [...(targetFolder.links || [])];
    const sourceNext = sourceBefore.filter((link) => link.id !== drag.link.id);
    const targetBase = sourceFolder.id === targetFolder.id
      ? sourceNext
      : targetBefore.filter((link) => link.id !== drag.link.id);
    const targetNext = [...targetBase];
    const movedLink = sourceFolder.id === targetFolder.id ? drag.link : { ...drag.link, folderId: targetFolder.id };
    targetNext.splice(insertionIndex(targetBase, drag.targetLinkId, drag.targetSide), 0, movedLink);
    if (sourceFolder.id === targetFolder.id && sameOrder(sourceBefore, targetNext)) return;

    if (sourceFolder.id === targetFolder.id) {
      sourceFolder.links = targetNext;
      applySortOrder(targetNext);
    } else {
      sourceFolder.links = sourceNext;
      targetFolder.links = targetNext;
      applySortOrder(sourceNext);
      applySortOrder(targetNext);
    }

    movingBookmark.value = true;
    try {
      if (sourceFolder.id === targetFolder.id) {
        await apiRequest('/api/admin/links/reorder', {
          method: 'PUT',
          body: jsonBody({ ids: targetNext.map((link) => link.id) }),
        });
      } else {
        await apiRequest('/api/admin/links/move', {
          method: 'PUT',
          body: jsonBody({
            linkId: drag.link.id,
            targetFolderId: targetFolder.id,
            sourceIds: sourceNext.map((link) => link.id),
            targetIds: targetNext.map((link) => link.id),
          }),
        });
      }
    } catch (error) {
      sourceFolder.links = sourceBefore;
      if (sourceFolder.id !== targetFolder.id) targetFolder.links = targetBefore;
      applySortOrder(sourceBefore);
      if (sourceFolder.id !== targetFolder.id) applySortOrder(targetBefore);
      showBookmarkMessage('error', error instanceof Error ? error.message : t('nav.moveFailed'));
    } finally {
      movingBookmark.value = false;
    }
  }

  function suppressPostDragClick() {
    if (postDragClickHandler) window.removeEventListener('click', postDragClickHandler, true);
    clearTimeout(postDragClickTimer);
    postDragClickHandler = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (postDragClickHandler) window.removeEventListener('click', postDragClickHandler, true);
      postDragClickHandler = null;
      clearTimeout(postDragClickTimer);
    };
    window.addEventListener('click', postDragClickHandler, true);
    postDragClickTimer = setTimeout(() => {
      if (postDragClickHandler) window.removeEventListener('click', postDragClickHandler, true);
      postDragClickHandler = null;
    }, 700);
  }

  function foldersWithParent(parentId: number | null) {
    return (payload.value?.folders || []).filter((folder) => (folder.parentId ?? null) === parentId);
  }

  function replaceFolderSubsetOrder(folders: Folder[]) {
    if (!payload.value) return;
    const orderedIds = new Set(folders.map((folder) => folder.id));
    let index = 0;
    payload.value.folders = payload.value.folders.map((folder) => orderedIds.has(folder.id) ? folders[index++] : folder);
  }

  function isInvalidFolderParent(sourceId: number, parentId: number | null) {
    let cursor = parentId ? findFolder(parentId) : null;
    const visited = new Set<number>();
    while (cursor && !visited.has(cursor.id)) {
      if (cursor.id === sourceId) return true;
      visited.add(cursor.id);
      cursor = cursor.parentId ? findFolder(cursor.parentId) : undefined;
    }
    return false;
  }

  function resolveFolderTarget(drag: FolderDragState, clientX: number, clientY: number) {
    const target = findFolderTarget(drag.folder.id, clientX, clientY);
    drag.targetParentId = target?.parentId ?? null;
    drag.targetFolderId = target?.folderId ?? null;
    drag.targetSide = target?.side ?? '';
  }

  function findFolderTarget(sourceId: number, clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    if (hoverNotab(element)) return null;

    const targetElement = element?.closest<HTMLElement>('[data-folder-card-id]');
    const targetId = Number(targetElement?.dataset.folderCardId);
    const target = Number.isInteger(targetId) ? findFolder(targetId) : null;
    if (target?.id === sourceId) return null;

    const parentId = target
      ? (target.parentId ? target.parentId : target.id)
      : (selectedCategoryId.value === 'all' ? null : Number(selectedCategoryId.value));
    if (!parentId || isInvalidFolderParent(sourceId, parentId)) return null;
    const folderId = target?.parentId ? target.id : null;
    if (!targetElement || !folderId) return { parentId, folderId, side: '' as DropSide };
    const rect = targetElement.getBoundingClientRect();
    return { parentId, folderId, side: (clientY < rect.top + rect.height / 2 ? 'before' : 'after') as DropSide };
  }

  function onFolderDragStart(request: { folder: Folder; pointerId: number; clientX: number; clientY: number }) {
    if (!organizing.value || !canOrganize.value || !request.folder.parentId || anyModalOpen.value || anyDragActive.value || movingFolder.value) return;
    startFolderDrag({
      folder: request.folder,
      sourceParentId: request.folder.parentId,
      pointerId: request.pointerId,
      clientX: request.clientX,
      clientY: request.clientY,
      targetParentId: null,
      targetFolderId: null,
      targetSide: '',
    });
  }

  async function persistFolderDrop(drag: FolderDragState) {
    if (!drag.targetParentId) return;
    const sourceBefore = foldersWithParent(drag.sourceParentId);
    const targetBefore = drag.sourceParentId === drag.targetParentId ? sourceBefore : foldersWithParent(drag.targetParentId);
    const sourceNext = sourceBefore.filter((folder) => folder.id !== drag.folder.id);
    const targetBase = drag.sourceParentId === drag.targetParentId
      ? sourceNext
      : targetBefore.filter((folder) => folder.id !== drag.folder.id);
    const targetNext = [...targetBase];
    targetNext.splice(insertionIndex(targetBase, drag.targetFolderId, drag.targetSide), 0, drag.folder);
    if (drag.sourceParentId === drag.targetParentId && sameOrder(sourceBefore, targetNext)) return;

    drag.folder.parentId = drag.targetParentId;
    applySortOrder(targetNext);
    replaceFolderSubsetOrder(targetNext);
    movingFolder.value = true;
    try {
      if (drag.sourceParentId !== drag.targetParentId) {
        await apiRequest(`/api/admin/folders/${drag.folder.id}`, {
          method: 'PUT',
          body: jsonBody({ parentId: drag.targetParentId }),
        });
      }
      await apiRequest('/api/admin/folders/reorder', {
        method: 'PUT',
        body: jsonBody({ ids: targetNext.map((folder) => folder.id) }),
      });
    } catch (error) {
      await options.reload().catch(() => undefined);
      showBookmarkMessage('error', error instanceof Error ? error.message : t('nav.folderMoveFailed'));
    } finally {
      movingFolder.value = false;
    }
  }

  function resolveNotabTarget(drag: NotabDragState, clientX: number, clientY: number) {
    const targetElement = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-notab-id]');
    const targetId = Number(targetElement?.dataset.notabId);
    const valid = targetElement && Number.isInteger(targetId) && targetId !== drag.folder.id;
    drag.targetNotabId = valid ? targetId : null;
    drag.targetSide = valid ? sideOf(targetElement.getBoundingClientRect(), clientX) : '';
  }

  function onNotabDragStart(folderId: number, event: PointerEvent) {
    const folder = findFolder(folderId);
    if (!folder || folder.parentId || !organizing.value || !canOrganize.value || anyModalOpen.value || anyDragActive.value || movingNotab.value) return;
    event.preventDefault();
    suppressTabClick = true;
    startNotabDrag({
      folder,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      targetNotabId: null,
      targetSide: '',
    });
  }

  async function persistNotabDrop(drag: NotabDragState) {
    if (!drag.targetNotabId) return;
    const before = [...categoryFolders.value];
    const base = before.filter((folder) => folder.id !== drag.folder.id);
    const next = [...base];
    next.splice(insertionIndex(base, drag.targetNotabId, drag.targetSide), 0, drag.folder);
    if (sameOrder(before, next)) return;
    applySortOrder(next);
    replaceFolderSubsetOrder(next);
    movingNotab.value = true;
    try {
      await apiRequest('/api/admin/folders/reorder', {
        method: 'PUT',
        body: jsonBody({ ids: next.map((folder) => folder.id) }),
      });
    } catch (error) {
      await options.reload().catch(() => undefined);
      showBookmarkMessage('error', error instanceof Error ? error.message : t('nav.notabMoveFailed'));
    } finally {
      movingNotab.value = false;
    }
  }

  function cancelAllDrags() {
    cancelBookmarkDrag();
    cancelFolderDrag();
    cancelNotabDrag();
  }

  onUnmounted(() => {
    stopOrganizePress();
    cancelAllDrags();
    clearTimeout(bookmarkMessageTimer);
    clearTimeout(postDragClickTimer);
    if (postDragClickHandler) window.removeEventListener('click', postDragClickHandler, true);
  });

  return {
    organizing,
    organizeArming,
    bookmarkDrag,
    folderDrag,
    notabDrag,
    dragPreview,
    anyModalOpen,
    movingBookmark,
    movingFolder,
    movingNotab,
    bookmarkMessage,
    pendingDelete,
    deletingItem,
    onNotabPointerDown,
    onNotabPointerMove,
    onNotabPointerEnd,
    onNotabClick,
    requestBookmarkDelete,
    requestFolderDelete,
    requestNotabDelete,
    confirmItemDelete,
    onBookmarkDragStart,
    onFolderDragStart,
    exitOrganizeMode,
  };
}
