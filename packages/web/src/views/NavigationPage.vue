<script setup lang="ts">
import '@/styles/public.css';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Activity, ArrowUpRight, Check, FolderIcon, Layers3, Link2, LogIn, ServerCog, Settings, Star, Trash2, WalletCards } from 'lucide-vue-next';
import AppearanceSettingsDrawer from '@/components/AppearanceSettingsDrawer.vue';
import BookmarkDeleteDialog from '@/components/BookmarkDeleteDialog.vue';
import ColorModeControl from '@/components/ColorModeControl.vue';
import LanguageControl from '@/components/LanguageControl.vue';
import FolderCard from '@/components/FolderCard.vue';
import FolderExpandModal from '@/components/FolderExpandModal.vue';
import FolderUnlockModal from '@/components/FolderUnlockModal.vue';
import HomeNotificationBell from '@/components/HomeNotificationBell.vue';
import HomeUrgentNoticeBar from '@/components/HomeUrgentNoticeBar.vue';
import SearchBar from '@/components/SearchBar.vue';
import ThemeScene from '@/components/ThemeScene.vue';
import { apiRequest, buildSearchUrl, jsonBody } from '@/api/client';
import type { Folder, Link, Site } from '@/api/types';
import { useHomeNotifications } from '@/composables/useHomeNotifications';
import { useAuthStore } from '@/stores/auth';
import { useNavigationStore } from '@/stores/navigation';
import { getAppearanceSettings, toAppearanceCssVars, toSceneTuning } from '@/utils/appearance';
import { getPortalSettings } from '@/utils/portal';
import { getNavigationEntries } from '@/utils/navigationEntries';
import { getEngine, getSearchEngineSettings, getSelectedEngineId, resolveSearchTemplate } from '@/utils/searchEngines';
import { getSceneIntensity, getTheme, getThemeAccentVars, pageTextCssVars, themeCssVars } from '@/utils/themes';
import type { ResolvedColorMode } from '@/utils/colorMode';
import { getSiteDefaultLocale } from '@/utils/locale';
import { useI18n } from '@/composables/useI18n';

const route = useRoute();
const auth = useAuthStore();
const navigation = useNavigationStore();
const { t, setSiteDefaultLocale } = useI18n();
const query = ref('');
const debouncedQuery = ref('');
const verifying = ref<Folder | null>(null);
const expandedFolder = ref<Folder | null>(null);
const visibleBackgroundImage = ref('');
const loadedBackgroundImage = ref('');
const folderLoadSentinel = ref<HTMLElement | null>(null);
const renderedFolderCount = ref(24);
const selectedCategoryId = ref<string>('all');
const categorySelectionInitialized = ref(false);
const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);
let backgroundPreloadVersion = 0;
let folderObserver: IntersectionObserver | null = null;
const tabsRef = ref<HTMLElement | null>(null);
const tabIndicatorStyle = ref<Record<string, string>>({ opacity: '0' });
const tabsScrollable = ref(false);
const appearanceOpen = ref(false);
const appearancePreview = ref<Site | null>(null);
const unlocking = ref(false);
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
const bookmarkDrag = ref<{
  link: Link;
  sourceFolderId: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  targetFolderId: number | null;
  targetLinkId: number | null;
  targetSide: 'before' | 'after' | '';
} | null>(null);
const folderDrag = ref<{
  folder: Folder;
  sourceParentId: number | null;
  pointerId: number;
  clientX: number;
  clientY: number;
  targetParentId: number | null;
  targetFolderId: number | null;
  targetSide: 'before' | 'after' | '';
} | null>(null);
const notabDrag = ref<{
  folder: Folder;
  pointerId: number;
  clientX: number;
  clientY: number;
  targetNotabId: number | null;
  targetSide: 'before' | 'after' | '';
} | null>(null);
let organizePressTimer: ReturnType<typeof setTimeout> | undefined;
let organizePress: { pointerId: number; startX: number; startY: number; element: HTMLElement } | null = null;
let suppressTabClick = false;
let notabHoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoveredNotabId: string | null = null;
let bookmarkMessageTimer: ReturnType<typeof setTimeout> | undefined;
let postDragClickTimer: ReturnType<typeof setTimeout> | undefined;
let postDragClickHandler: ((event: MouseEvent) => void) | null = null;
const resolvedMode = ref<ResolvedColorMode>(
  typeof document !== 'undefined' && document.documentElement.dataset.colorMode === 'dark' ? 'dark' : 'light',
);

/**
 * Brings the active notab back into view after a switch. On phones the strip scrolls horizontally
 * and the selected tab is often off-screen, which left the indicator invisible. `inline: 'nearest'`
 * is a no-op when the tab is already fully visible, so desktop is untouched.
 */
function keepActiveTabVisible(nav: HTMLElement, active: HTMLElement) {
  if (nav.scrollWidth <= nav.clientWidth + 1) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  active.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', inline: 'nearest', block: 'nearest' });
}

function updateTabIndicator() {
  const nav = tabsRef.value;
  tabsScrollable.value = Boolean(nav && nav.scrollWidth > nav.clientWidth + 1);
  const active = nav?.querySelector<HTMLElement>('.notab-select.active');
  if (!nav || !active) {
    tabIndicatorStyle.value = { opacity: '0' };
    return;
  }
  tabIndicatorStyle.value = {
    opacity: '1',
    transform: `translateX(${(active.parentElement?.classList.contains('notab-shell') ? active.parentElement.offsetLeft : 0) + active.offsetLeft}px)`,
    width: `${active.offsetWidth}px`,
  };
  keepActiveTabVisible(nav, active);
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, (value) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = value;
  }, 150);
});

const username = computed(() => String(route.params.username || 'admin'));
const payload = computed(() => navigation.payload);
const visualSite = computed(() => appearancePreview.value || payload.value?.site || null);
const accessLocked = computed(() => Boolean(payload.value?.access?.required && !payload.value.access.unlocked));
const canEditAppearance = computed(() => auth.authenticated && auth.user?.id === payload.value?.site.userId);
const {
  items: homeNotificationItems,
  loading: homeNotificationLoading,
  unreadCount: homeNotificationUnreadCount,
  urgentItems: homeUrgentNotifications,
  urgentOverflow: homeUrgentOverflow,
  markRead: markHomeNotificationRead,
  dismiss: dismissHomeNotification,
  markAllRead: markAllHomeNotificationsRead,
} = useHomeNotifications(canEditAppearance);
const appearanceEntryHref = computed(() => {
  if (auth.authenticated && auth.user) return `/${encodeURIComponent(auth.user.username)}`;
  return `/login?next=${encodeURIComponent(route.fullPath || '/')}`;
});
const appearanceEntryLabel = computed(() => (auth.authenticated ? t('nav.mySettings') : t('nav.adminLogin')));
const allLinks = computed(() => payload.value?.folders.flatMap((folder) => folder.links || []) || []);
const searchIndex = computed(() =>
  allLinks.value.map((link) => ({
    id: link.id,
    text: normalizeSearchText(link),
  })),
);
const normalizedQuery = computed(() => debouncedQuery.value.trim().toLocaleLowerCase());
const canOrganize = computed(() => canEditAppearance.value && !accessLocked.value && !normalizedQuery.value);
const matchedLinkIds = computed(() => {
  if (!normalizedQuery.value) return null;
  return new Set(searchIndex.value.filter((entry) => entry.text.includes(normalizedQuery.value)).map((entry) => entry.id));
});
const localMatchCount = computed(() => {
  return matchedLinkIds.value?.size ?? allLinks.value.length;
});
const activeTheme = computed(() => {
  const settings = visualSite.value?.settings as { theme?: { id?: string } } | null | undefined;
  return getTheme(settings?.theme?.id);
});
const sceneIntensity = computed(() => getSceneIntensity(visualSite.value?.settings));
// The public page owns the site payload, so it publishes the admin-chosen default language to
// the shared locale state. A visitor's own override still wins over it.
watch(() => payload.value?.site.settings, (settings) => {
  setSiteDefaultLocale(getSiteDefaultLocale(settings));
}, { immediate: true });
const appearance = computed(() => getAppearanceSettings(visualSite.value?.settings));
const modeCssVars = computed<Record<string, string>>((): Record<string, string> => {
  if (resolvedMode.value !== 'dark') {
    return {
      '--public-mode-scrim': 'rgba(8, 12, 18, 0.02)',
      '--public-notification-surface': '#ffffff',
      '--public-notification-text': '#111827',
      '--public-notification-text-rgb': '17, 24, 39',
      '--public-notification-border-rgb': '15, 23, 42',
      '--public-notification-hover-rgb': '15, 23, 42',
    };
  }
  return {
    // The dark-mode overlay strength is a setting; 0.38 is what the default 42 works out to.
    '--public-mode-scrim': `rgba(5, 8, 14, ${(appearance.value.glassDarkOverlay * 0.009).toFixed(3)})`,
    '--public-card-color-rgb': '22, 25, 33',
    '--public-card-opacity': '0.52',
    '--public-search-color-rgb': '20, 23, 31',
    '--public-search-opacity': '0.58',
    '--public-tab-color-rgb': '20, 23, 31',
    '--public-page-text': '#f4f6f8',
    '--public-page-text-rgb': '244, 246, 248',
    '--public-bookmark-text': '#ffffff',
    '--public-bookmark-text-rgb': '255, 255, 255',
    '--public-notab-text': '#ffffff',
    '--public-notab-text-rgb': '255, 255, 255',
    '--public-folder-text': '#ffffff',
    '--public-folder-text-rgb': '255, 255, 255',
    '--public-category-text': '#ffffff',
    '--public-category-text-rgb': '255, 255, 255',
    '--public-border-rgb': '226, 231, 238',
    '--public-highlight-rgb': '241, 244, 248',
    '--public-hover-rgb': '226, 231, 238',
    '--public-shadow-rgb': '0, 0, 0',
    '--public-overlay-rgb': '5, 8, 14',
    '--public-notification-surface': 'rgba(5, 8, 14, 0.94)',
    '--public-notification-text': '#ffffff',
    '--public-notification-text-rgb': '255, 255, 255',
    '--public-notification-border-rgb': '226, 231, 238',
    '--public-notification-hover-rgb': '226, 231, 238',
  };
});
const sceneTuning = computed(() => toSceneTuning(appearance.value));

/** The user's own homepage background, honouring the on/off switch. */
const activeBackgroundImage = computed(() => (
  appearance.value.backgroundImageEnabled ? visibleBackgroundImage.value : ''
));

/**
 * Scrim over the background image: the shared strength plus whichever mode-specific strength
 * applies, so a photo can be dimmed harder in dark mode than in light.
 */
const backgroundOverlayTotal = computed(() => {
  const perMode = resolvedMode.value === 'dark' ? appearance.value.overlayDark : appearance.value.overlayLight;
  return Math.min(1, (appearance.value.backgroundOverlay + perMode) / 100);
});

const backgroundScrim = computed(() => (
  `rgba(var(--public-overlay-rgb, 8, 12, 18), ${backgroundOverlayTotal.value.toFixed(3)})`
));

const backgroundStyle = computed(() => {
  const appearanceVars = toAppearanceCssVars(appearance.value);
  const publicThemeVars = activeTheme.value ? themeCssVars(activeTheme.value) : {};
  const site = visualSite.value;
  const accentVars = getThemeAccentVars(site?.settings);
  if (!site) {
    return {
      ...appearanceVars,
      ...pageTextCssVars('#f3f4f6'),
      '--nav-bg-color': '#090a0f',
      '--nav-bg-image': 'none',
      ...modeCssVars.value,
      color: '#f3f4f6',
    };
  }

  return {
    ...appearanceVars,
    ...publicThemeVars,
    ...accentVars,
    ...pageTextCssVars(site.fontColor || activeTheme.value?.fontColor || '#f3f4f6'),
    '--nav-bg-color': site.backgroundColor || '#090a0f',
    // The scrim rides on the image layer as a flat gradient rather than a pseudo-element:
    // `.nav-page` and `.public-glass-page` are the same element, so an `::after` here would
    // replace the mode scrim that rule already owns.
    '--nav-bg-image': activeBackgroundImage.value
      ? `linear-gradient(${backgroundScrim.value}, ${backgroundScrim.value}), url(${JSON.stringify(activeBackgroundImage.value)})`
      : 'none',
    ...modeCssVars.value,
    color: resolvedMode.value === 'dark' ? '#f4f6f8' : site.fontColor || '#f3f4f6',
  };
});
const savedBackgroundImageUrl = computed(() => payload.value?.site.backgroundImage || '');
const backgroundImageUrl = computed(() => {
  const site = payload.value?.site;
  if (!savedBackgroundImageUrl.value) return '';
  const endpoint = `/api/navigation/${encodeURIComponent(username.value)}/background`;
  return site?.updatedAt ? `${endpoint}?v=${encodeURIComponent(site.updatedAt)}` : endpoint;
});
const portal = computed(() => getPortalSettings(payload.value?.site.settings, import.meta.env.VITE_BLOG_URL));
const portalHref = computed(() => (portal.value.enabled ? portal.value.url : ''));
const portalTarget = computed(() => (portal.value.openInNewTab ? '_blank' : undefined));
const portalRel = computed(() => (portal.value.openInNewTab ? 'noreferrer' : undefined));
const navigationEntries = computed(() => getNavigationEntries(payload.value?.site.settings).filter((entry) => entry.enabled));
const navigationEntryIcons = {
  activity: Activity,
  link: Link2,
  star: Star,
  'wallet-cards': WalletCards,
  'server-cog': ServerCog,
};

function navigationEntryIcon(icon: string) {
  return navigationEntryIcons[icon as keyof typeof navigationEntryIcons] || Link2;
}
const searchEngineSettings = computed(() => getSearchEngineSettings(
  payload.value?.site.settings,
  payload.value?.site.searchUrlTemplate,
));
const folderMetadata = computed(() => {
  const folders = payload.value?.folders || [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const depthById = new Map<string | number, number>();
  const topIdById = new Map<string | number, string | number>();

  const resolve = (folder: Folder) => {
    const cached = depthById.get(folder.id);
    if (cached !== undefined) return cached;

    let depth = 0;
    let topId: string | number = folder.id;
    let parentId = folder.parentId || null;
    const visited = new Set<string | number>([folder.id]);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      depth += 1;
      topId = parent.id;
      parentId = parent.parentId || null;
    }
    depthById.set(folder.id, depth);
    topIdById.set(folder.id, topId);
    return depth;
  };

  folders.forEach(resolve);
  return { byId, depthById, topIdById };
});

// Categories = top-level folders; tabs show [all, ...categories].
const categoryFolders = computed(() => {
  const { byId } = folderMetadata.value;
  return (payload.value?.folders || []).filter((folder) => !folder.parentId || !byId.has(folder.parentId));
});

// Card list follows the bookmark-tree model: sub-folders become cards, categories don't —
// unless a category carries direct links (or is locked), which earns it a fallback card.
const displayFolders = computed(() => {
  const folders = payload.value?.folders || [];
  const byParent = new Map<string | number, Folder[]>();
  for (const folder of folders) {
    if (!folder.parentId || !folderMetadata.value.byId.has(folder.parentId)) continue;
    const siblings = byParent.get(folder.parentId);
    if (siblings) siblings.push(folder);
    else byParent.set(folder.parentId, [folder]);
  }

  const result: Folder[] = [];
  const visit = (folder: Folder) => {
    for (const child of byParent.get(folder.id) || []) {
      result.push(child);
      visit(child);
    }
  };
  for (const root of categoryFolders.value) {
    if (root.locked || (root.links?.length || 0) > 0) result.push(root);
    visit(root);
  }
  return result;
});

const categoryFilteredFolders = computed(() => {
  // Searching spans all categories; otherwise honor the picked tab.
  if (normalizedQuery.value || selectedCategoryId.value === 'all') return displayFolders.value;
  return displayFolders.value.filter((folder) => String(folderMetadata.value.topIdById.get(folder.id) ?? folder.id) === selectedCategoryId.value);
});

const shownFolders = computed(() => {
  if (!matchedLinkIds.value) return categoryFilteredFolders.value;
  return categoryFilteredFolders.value.map((folder) => ({
    ...folder,
    links: (folder.links || []).filter((link) => matchedLinkIds.value?.has(link.id)),
  }));
});
const foldersWithLinks = computed(() => shownFolders.value.filter((folder) => folder.locked || (folder.links?.length || 0) > 0 || !normalizedQuery.value));
const anyModalOpen = computed(() => Boolean(expandedFolder.value || verifying.value || appearanceOpen.value || pendingDelete.value));
const anyDragActive = computed(() => Boolean(bookmarkDrag.value || folderDrag.value || notabDrag.value));
const renderedFolders = computed(() => foldersWithLinks.value.slice(0, renderedFolderCount.value));
const hasMoreFolders = computed(() => renderedFolderCount.value < foldersWithLinks.value.length);
const categoryTabs = computed(() => [{ id: 'all', name: t('nav.allTab') }, ...categoryFolders.value.map((folder) => ({ id: String(folder.id), name: folder.name }))]);
const dragPreview = computed(() => {
  if (bookmarkDrag.value) return { kind: 'bookmark' as const, label: bookmarkDrag.value.link.name, x: bookmarkDrag.value.clientX, y: bookmarkDrag.value.clientY };
  if (folderDrag.value) return { kind: 'folder' as const, label: folderDrag.value.folder.name, x: folderDrag.value.clientX, y: folderDrag.value.clientY };
  if (notabDrag.value) return { kind: 'notab' as const, label: notabDrag.value.folder.name, x: notabDrag.value.clientX, y: notabDrag.value.clientY };
  return null;
});

function selectCategory(id: string) {
  selectedCategoryId.value = id;
  renderedFolderCount.value = 24;
}

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
  renderedFolderCount.value = Math.max(24, foldersWithLinks.value.length);
  suppressTabClick = true;
  stopOrganizePress();
  void nextTick(updateTabIndicator);
}

function exitOrganizeMode() {
  stopOrganizePress();
  cancelAllDrags();
  organizing.value = false;
  suppressTabClick = false;
  void nextTick(updateTabIndicator);
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
  selectCategory(tabId);
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
      renderedFolderCount.value = 24;
      clearNotabHover();
      await nextTick();
      updateTabIndicator();
      if (bookmarkDrag.value) resolveDropTarget(bookmarkDrag.value.clientX, bookmarkDrag.value.clientY);
      if (folderDrag.value) resolveFolderDropTarget(folderDrag.value.clientX, folderDrag.value.clientY);
    }, 600);
  }
  return true;
}

function resolveDropTarget(clientX: number, clientY: number) {
  const drag = bookmarkDrag.value;
  if (!drag || typeof document === 'undefined') return;
  drag.clientX = clientX;
  drag.clientY = clientY;

  const element = document.elementFromPoint(clientX, clientY);
  const notab = element?.closest<HTMLElement>('[data-notab-id]');
  const notabId = notab?.dataset.notabId || null;
  if (notabId && scheduleNotabSwitch(notabId)) {
    drag.targetFolderId = null;
    drag.targetLinkId = null;
    drag.targetSide = '';
    return;
  }
  clearNotabHover();

  const folderPanel = element?.closest<HTMLElement>('[data-drop-folder-id]');
  const folderId = Number(folderPanel?.dataset.dropFolderId);
  const targetFolder = Number.isInteger(folderId) ? findFolder(folderId) : null;
  if (!folderPanel || !targetFolder || targetFolder.locked) {
    drag.targetFolderId = null;
    drag.targetLinkId = null;
    drag.targetSide = '';
    return;
  }

  const bookmark = element?.closest<HTMLElement>('[data-bookmark-id]');
  const bookmarkId = Number(bookmark?.dataset.bookmarkId);
  if (bookmarkId === drag.link.id) {
    drag.targetFolderId = null;
    drag.targetLinkId = null;
    drag.targetSide = '';
    return;
  }
  drag.targetFolderId = folderId;
  if (bookmark && Number.isInteger(bookmarkId)) {
    const rect = bookmark.getBoundingClientRect();
    drag.targetLinkId = bookmarkId;
    drag.targetSide = clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  } else {
    drag.targetLinkId = null;
    drag.targetSide = '';
  }
}

function onBookmarkDragStart(request: { link: Link; folderId: number; pointerId: number; clientX: number; clientY: number }) {
  if (!canOrganize.value || anyModalOpen.value || anyDragActive.value || movingBookmark.value) return;
  bookmarkDrag.value = {
    link: request.link,
    sourceFolderId: request.folderId,
    pointerId: request.pointerId,
    clientX: request.clientX,
    clientY: request.clientY,
    targetFolderId: null,
    targetLinkId: null,
    targetSide: '',
  };
  document.body.classList.add('organize-dragging');
  window.addEventListener('pointermove', onBookmarkDragMove);
  window.addEventListener('pointerup', onBookmarkDragEnd);
  window.addEventListener('pointercancel', cancelBookmarkDrag);
  resolveDropTarget(request.clientX, request.clientY);
}

function onBookmarkDragMove(event: PointerEvent) {
  if (!bookmarkDrag.value || event.pointerId !== bookmarkDrag.value.pointerId) return;
  event.preventDefault();
  resolveDropTarget(event.clientX, event.clientY);
}

function insertionIndex(links: Link[], targetLinkId: number | null, side: 'before' | 'after' | '') {
  if (!targetLinkId) return links.length;
  const targetIndex = links.findIndex((link) => link.id === targetLinkId);
  if (targetIndex < 0) return links.length;
  return Math.min(links.length, targetIndex + (side === 'after' ? 1 : 0));
}

function applySortOrder(links: Link[]) {
  links.forEach((link, index) => {
    link.sortOrder = (links.length - index) * 10;
  });
}

function sameOrder(left: Link[], right: Link[]) {
  return left.length === right.length && left.every((link, index) => link.id === right[index]?.id);
}

async function persistBookmarkDrop(drag: NonNullable<typeof bookmarkDrag.value>) {
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

function finishBookmarkDrag() {
  clearNotabHover();
  window.removeEventListener('pointermove', onBookmarkDragMove);
  window.removeEventListener('pointerup', onBookmarkDragEnd);
  window.removeEventListener('pointercancel', cancelBookmarkDrag);
  document.body.classList.remove('organize-dragging');
  bookmarkDrag.value = null;
}

function onBookmarkDragEnd(event: PointerEvent) {
  const drag = bookmarkDrag.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  resolveDropTarget(event.clientX, event.clientY);
  const completedDrag = { ...drag };
  suppressPostDragClick();
  finishBookmarkDrag();
  void persistBookmarkDrop(completedDrag);
}

function cancelBookmarkDrag() {
  if (bookmarkDrag.value) finishBookmarkDrag();
}

function foldersWithParent(parentId: number | null) {
  return (payload.value?.folders || []).filter((folder) => (folder.parentId ?? null) === parentId);
}

function folderInsertionIndex(folders: Folder[], targetFolderId: number | null, side: 'before' | 'after' | '') {
  if (!targetFolderId) return folders.length;
  const targetIndex = folders.findIndex((folder) => folder.id === targetFolderId);
  if (targetIndex < 0) return folders.length;
  return Math.min(folders.length, targetIndex + (side === 'after' ? 1 : 0));
}

function applyFolderSortOrder(folders: Folder[]) {
  folders.forEach((folder, index) => {
    folder.sortOrder = (folders.length - index) * 10;
  });
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

function resolveFolderDropTarget(clientX: number, clientY: number) {
  const drag = folderDrag.value;
  if (!drag || typeof document === 'undefined') return;
  drag.clientX = clientX;
  drag.clientY = clientY;
  const element = document.elementFromPoint(clientX, clientY);
  const notabId = element?.closest<HTMLElement>('[data-notab-id]')?.dataset.notabId;
  if (notabId && scheduleNotabSwitch(notabId)) {
    drag.targetParentId = null;
    drag.targetFolderId = null;
    drag.targetSide = '';
    return;
  }
  clearNotabHover();

  const targetElement = element?.closest<HTMLElement>('[data-folder-card-id]');
  const targetId = Number(targetElement?.dataset.folderCardId);
  const target = Number.isInteger(targetId) ? findFolder(targetId) : null;
  if (target?.id === drag.folder.id) {
    drag.targetParentId = null;
    drag.targetFolderId = null;
    drag.targetSide = '';
    return;
  }

  const targetParentId = target
    ? (target.parentId ? target.parentId : target.id)
    : (selectedCategoryId.value === 'all' ? null : Number(selectedCategoryId.value));
  if (!targetParentId || isInvalidFolderParent(drag.folder.id, targetParentId)) {
    drag.targetParentId = null;
    drag.targetFolderId = null;
    drag.targetSide = '';
    return;
  }
  drag.targetParentId = targetParentId;
  drag.targetFolderId = target?.parentId ? target.id : null;
  if (targetElement && drag.targetFolderId) {
    const rect = targetElement.getBoundingClientRect();
    drag.targetSide = clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  } else {
    drag.targetSide = '';
  }
}

function onFolderDragStart(request: { folder: Folder; pointerId: number; clientX: number; clientY: number }) {
  if (!organizing.value || !canOrganize.value || !request.folder.parentId || anyModalOpen.value || anyDragActive.value || movingFolder.value) return;
  folderDrag.value = {
    folder: request.folder,
    sourceParentId: request.folder.parentId,
    pointerId: request.pointerId,
    clientX: request.clientX,
    clientY: request.clientY,
    targetParentId: null,
    targetFolderId: null,
    targetSide: '',
  };
  document.body.classList.add('organize-dragging');
  window.addEventListener('pointermove', onFolderDragMove);
  window.addEventListener('pointerup', onFolderDragEnd);
  window.addEventListener('pointercancel', cancelFolderDrag);
  resolveFolderDropTarget(request.clientX, request.clientY);
}

function onFolderDragMove(event: PointerEvent) {
  if (!folderDrag.value || event.pointerId !== folderDrag.value.pointerId) return;
  event.preventDefault();
  resolveFolderDropTarget(event.clientX, event.clientY);
}

async function persistFolderDrop(drag: NonNullable<typeof folderDrag.value>) {
  if (!drag.targetParentId) return;
  const sourceBefore = foldersWithParent(drag.sourceParentId);
  const targetBefore = drag.sourceParentId === drag.targetParentId ? sourceBefore : foldersWithParent(drag.targetParentId);
  const sourceNext = sourceBefore.filter((folder) => folder.id !== drag.folder.id);
  const targetBase = drag.sourceParentId === drag.targetParentId
    ? sourceNext
    : targetBefore.filter((folder) => folder.id !== drag.folder.id);
  const targetNext = [...targetBase];
  targetNext.splice(folderInsertionIndex(targetBase, drag.targetFolderId, drag.targetSide), 0, drag.folder);
  if (drag.sourceParentId === drag.targetParentId && sourceBefore.every((folder, index) => folder.id === targetNext[index]?.id)) return;

  drag.folder.parentId = drag.targetParentId;
  applyFolderSortOrder(targetNext);
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
    await navigation.load(username.value).catch(() => undefined);
    showBookmarkMessage('error', error instanceof Error ? error.message : t('nav.folderMoveFailed'));
  } finally {
    movingFolder.value = false;
  }
}

function finishFolderDrag() {
  clearNotabHover();
  window.removeEventListener('pointermove', onFolderDragMove);
  window.removeEventListener('pointerup', onFolderDragEnd);
  window.removeEventListener('pointercancel', cancelFolderDrag);
  document.body.classList.remove('organize-dragging');
  folderDrag.value = null;
}

function onFolderDragEnd(event: PointerEvent) {
  const drag = folderDrag.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  resolveFolderDropTarget(event.clientX, event.clientY);
  const completed = { ...drag };
  finishFolderDrag();
  void persistFolderDrop(completed);
}

function cancelFolderDrag() {
  if (folderDrag.value) finishFolderDrag();
}

function resolveNotabDropTarget(clientX: number, clientY: number) {
  const drag = notabDrag.value;
  if (!drag || typeof document === 'undefined') return;
  drag.clientX = clientX;
  drag.clientY = clientY;
  const targetElement = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-notab-id]');
  const targetId = Number(targetElement?.dataset.notabId);
  if (!targetElement || !Number.isInteger(targetId) || targetId === drag.folder.id) {
    drag.targetNotabId = null;
    drag.targetSide = '';
    return;
  }
  const rect = targetElement.getBoundingClientRect();
  drag.targetNotabId = targetId;
  drag.targetSide = clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

function onNotabDragStart(folderId: number, event: PointerEvent) {
  const folder = findFolder(folderId);
  if (!folder || folder.parentId || !organizing.value || !canOrganize.value || anyModalOpen.value || anyDragActive.value || movingNotab.value) return;
  event.preventDefault();
  suppressTabClick = true;
  notabDrag.value = {
    folder,
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    targetNotabId: null,
    targetSide: '',
  };
  document.body.classList.add('organize-dragging');
  window.addEventListener('pointermove', onNotabDragMove);
  window.addEventListener('pointerup', onNotabDragEnd);
  window.addEventListener('pointercancel', cancelNotabDrag);
  resolveNotabDropTarget(event.clientX, event.clientY);
}

function onNotabDragMove(event: PointerEvent) {
  if (!notabDrag.value || event.pointerId !== notabDrag.value.pointerId) return;
  event.preventDefault();
  resolveNotabDropTarget(event.clientX, event.clientY);
}

async function persistNotabDrop(drag: NonNullable<typeof notabDrag.value>) {
  if (!drag.targetNotabId) return;
  const before = [...categoryFolders.value];
  const base = before.filter((folder) => folder.id !== drag.folder.id);
  const next = [...base];
  next.splice(folderInsertionIndex(base, drag.targetNotabId, drag.targetSide), 0, drag.folder);
  if (before.every((folder, index) => folder.id === next[index]?.id)) return;
  applyFolderSortOrder(next);
  replaceFolderSubsetOrder(next);
  movingNotab.value = true;
  try {
    await apiRequest('/api/admin/folders/reorder', {
      method: 'PUT',
      body: jsonBody({ ids: next.map((folder) => folder.id) }),
    });
  } catch (error) {
    await navigation.load(username.value).catch(() => undefined);
    showBookmarkMessage('error', error instanceof Error ? error.message : t('nav.notabMoveFailed'));
  } finally {
    movingNotab.value = false;
  }
}

function finishNotabDrag() {
  window.removeEventListener('pointermove', onNotabDragMove);
  window.removeEventListener('pointerup', onNotabDragEnd);
  window.removeEventListener('pointercancel', cancelNotabDrag);
  document.body.classList.remove('organize-dragging');
  notabDrag.value = null;
}

function onNotabDragEnd(event: PointerEvent) {
  const drag = notabDrag.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  resolveNotabDropTarget(event.clientX, event.clientY);
  const completed = { ...drag };
  finishNotabDrag();
  void persistNotabDrop(completed);
}

function cancelNotabDrag() {
  if (notabDrag.value) finishNotabDrag();
}

function cancelAllDrags() {
  cancelBookmarkDrag();
  cancelFolderDrag();
  cancelNotabDrag();
}

function normalizeSearchText(link: Link) {
  return `${link.name} ${link.description || ''} ${link.url}`.toLocaleLowerCase();
}

async function load() {
  await navigation.load(username.value).catch(() => undefined);
}

function removeBackgroundHints() {
  if (typeof document === 'undefined') return;
  document.head.querySelectorAll('[data-nono-background-preload]').forEach((node) => node.remove());
}

function addBackgroundHint(rel: 'dns-prefetch' | 'preconnect' | 'preload', href: string, as?: string) {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  link.dataset.nonoBackgroundPreload = 'true';
  if (as) {
    link.as = as;
    link.setAttribute('as', as);
  }
  if (rel === 'preload') link.setAttribute('fetchpriority', 'high');
  document.head.appendChild(link);
}

function preloadPublicBackground(url?: string | null) {
  const requestVersion = ++backgroundPreloadVersion;
  visibleBackgroundImage.value = url || '';
  loadedBackgroundImage.value = '';
  removeBackgroundHints();
  if (!url || typeof document === 'undefined') return;

  try {
    const origin = new URL(url, window.location.href).origin;
    if (origin !== window.location.origin) {
      addBackgroundHint('dns-prefetch', origin);
      addBackgroundHint('preconnect', origin);
    }
  } catch {
    // Invalid URLs fall back to the stable color layer.
  }

  addBackgroundHint('preload', url, 'image');
  preloadBackgroundCandidate(url, requestVersion, savedBackgroundImageUrl.value);
}

function preloadBackgroundCandidate(url: string, requestVersion: number, fallbackUrl = '') {
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.onload = () => {
    if (requestVersion === backgroundPreloadVersion) loadedBackgroundImage.value = url;
  };
  image.onerror = () => {
    if (requestVersion !== backgroundPreloadVersion) return;
    if (fallbackUrl && fallbackUrl !== url) {
      visibleBackgroundImage.value = fallbackUrl;
      loadedBackgroundImage.value = '';
      try {
        const origin = new URL(fallbackUrl, window.location.href).origin;
        if (origin !== window.location.origin) {
          addBackgroundHint('dns-prefetch', origin);
          addBackgroundHint('preconnect', origin);
        }
      } catch {
        // The second image load below is the final validity check.
      }
      preloadBackgroundCandidate(fallbackUrl, requestVersion);
      return;
    }
    visibleBackgroundImage.value = '';
    loadedBackgroundImage.value = '';
  };
  image.src = url;
}

async function submitSearch() {
  const q = query.value.trim();
  if (accessLocked.value) {
    if (!q || unlocking.value) return;
    unlocking.value = true;
    try {
      const unlocked = await navigation.unlock(username.value, q);
      if (unlocked) {
        query.value = '';
        debouncedQuery.value = '';
        return;
      }
    } catch {
      // The locked search box remains a normal web search when unlock is unavailable.
    } finally {
      unlocking.value = false;
    }
    window.location.href = buildSearchUrl(q, resolveSearchTemplate(payload.value?.site.searchUrlTemplate, searchEngineSettings.value));
    return;
  }
  if (!q) return;
  const liveQuery = q.toLocaleLowerCase();
  const hasLocalMatch = searchIndex.value.some((entry) => entry.text.includes(liveQuery));
  if (!hasLocalMatch || payload.value?.site.localSearchFirst === false) {
    window.location.href = buildSearchUrl(q, resolveSearchTemplate(payload.value?.site.searchUrlTemplate, searchEngineSettings.value));
  }
}

const searchEngineTick = ref(0);
const externalSearchUrl = computed(() => {
  searchEngineTick.value; // re-evaluate when the picked engine changes
  const q = query.value.trim();
  if (!q) return '';
  return buildSearchUrl(q, resolveSearchTemplate(payload.value?.site.searchUrlTemplate, searchEngineSettings.value));
});
const externalSearchLabel = computed(() => {
  searchEngineTick.value;
  const engine = getEngine(getSelectedEngineId(searchEngineSettings.value), searchEngineSettings.value);
  if (!engine.template) return t('nav.externalSearch');
  return engine.labelKey ? t(engine.labelKey) : engine.label;
});

function onFolderVerified(links: Link[]) {
  if (verifying.value) {
    verifying.value.links = links;
    verifying.value.locked = false;
  }
  verifying.value = null;
}

function onAppearanceSaved(site: Site) {
  if (!navigation.payload) return;
  navigation.updateSite(username.value, { ...navigation.payload.site, ...site });
  appearancePreview.value = null;
}

function onAppearancePreview(site: Site) {
  appearancePreview.value = site;
}

function closeAppearance() {
  appearanceOpen.value = false;
  appearancePreview.value = null;
}

// Modals own Escape/focus handling; the page only locks body scroll while one is open.
watch(anyModalOpen, (open) => {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = open ? 'hidden' : '';
});

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && organizing.value && !anyModalOpen.value) {
    exitOrganizeMode();
    return;
  }
  if (event.key === '/' && !anyModalOpen.value && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const el = event.target;
    if (el instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
    event.preventDefault();
    searchBarRef.value?.focus();
  }
}

function folderDepth(folder: Folder) {
  return folderMetadata.value.depthById.get(folder.id) || 0;
}

function loadMoreFolders() {
  renderedFolderCount.value = Math.min(renderedFolderCount.value + 24, foldersWithLinks.value.length);
}

function observeFolderSentinel(element: HTMLElement | null) {
  folderObserver?.disconnect();
  folderObserver = null;
  if (!element || typeof IntersectionObserver === 'undefined') return;

  folderObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMoreFolders();
    },
    { rootMargin: '600px 0px' },
  );
  folderObserver.observe(element);
}

onMounted(() => {
  load();
  window.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('resize', updateTabIndicator);
});
watch(username, load);
watch(username, () => {
  query.value = '';
  debouncedQuery.value = '';
});
watch(accessLocked, async (locked) => {
  if (!locked) return;
  await nextTick();
  searchBarRef.value?.focus();
}, { immediate: true });
watch(canEditAppearance, (allowed) => {
  if (!allowed) {
    appearanceOpen.value = false;
    pendingDelete.value = null;
    exitOrganizeMode();
  }
});
watch(backgroundImageUrl, preloadPublicBackground, { immediate: true });
watch(normalizedQuery, () => {
  renderedFolderCount.value = 24;
  if (normalizedQuery.value) exitOrganizeMode();
});
watch(categoryFolders, (folders) => {
  if (!payload.value || categorySelectionInitialized.value) return;
  selectedCategoryId.value = folders[0] ? String(folders[0].id) : 'all';
  categorySelectionInitialized.value = true;
}, { immediate: true });
watch(folderLoadSentinel, observeFolderSentinel);
watch(
  () => [selectedCategoryId.value, categoryTabs.value.map((tab) => tab.id).join(',')],
  async () => {
    await nextTick();
    updateTabIndicator();
  },
  { immediate: false },
);
onUnmounted(() => {
  stopOrganizePress();
  cancelAllDrags();
  folderObserver?.disconnect();
  removeBackgroundHints();
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('resize', updateTabIndicator);
  clearTimeout(debounceTimer);
  clearTimeout(bookmarkMessageTimer);
  clearTimeout(postDragClickTimer);
  if (postDragClickHandler) window.removeEventListener('click', postDragClickHandler, true);
  if (typeof document !== 'undefined') document.body.style.overflow = '';
});
</script>

<template>
  <main
    v-if="payload"
    class="nav-page public-glass-page"
    :class="{ 'nav-bg-visible': activeBackgroundImage, 'nav-bg-loaded': loadedBackgroundImage && activeBackgroundImage, 'navigation-locked': accessLocked }"
    :style="backgroundStyle"
    :data-color-mode="resolvedMode"
    :data-theme-tone="activeTheme?.tone"
  >
    <ThemeScene
      v-if="sceneIntensity > 0 && appearance.sceneEnabled"
      :theme="activeTheme"
      :intensity="sceneIntensity"
      :mode="resolvedMode"
      :tuning="sceneTuning"
    />
    <div class="public-corner-actions">
      <HomeNotificationBell
        v-if="canEditAppearance"
        :items="homeNotificationItems"
        :unread-count="homeNotificationUnreadCount"
        :loading="homeNotificationLoading"
        @mark-read="markHomeNotificationRead"
        @dismiss="dismissHomeNotification"
        @mark-all-read="markAllHomeNotificationsRead"
      />
      <LanguageControl />
      <ColorModeControl @change="resolvedMode = $event" />
      <button
        v-if="canEditAppearance"
        class="portal-corner-link"
        data-testid="portal-corner-link"
        type="button"
        :aria-label="t('appearance.openLabel')"
        :aria-expanded="appearanceOpen"
        @click="appearanceOpen = true"
      >
        <Settings :size="17" />
        <span>{{ t('appearance.entry') }}</span>
      </button>
      <a
        v-else
        class="portal-corner-link"
        data-testid="portal-corner-link"
        :href="appearanceEntryHref"
        :aria-label="appearanceEntryLabel"
      >
        <LogIn :size="17" />
        <span>{{ appearanceEntryLabel }}</span>
      </a>
    </div>

    <div class="nav-content">
      <header class="nav-header">
        <component
          :is="portalHref ? 'a' : 'div'"
          class="header-vibe"
          :class="{ 'header-vibe-link': portalHref }"
          :href="portalHref || undefined"
          :target="portalTarget"
          :rel="portalRel"
          data-testid="portal-center-link"
        >
          <span v-if="portal.imageUrl" class="portal-center-image">
            <img :src="portal.imageUrl" :alt="portal.label" />
            <ArrowUpRight class="portal-center-arrow" :size="17" />
          </span>
          <h1>{{ payload?.site.name || 'NoNo' }}</h1>
          <p>{{ payload?.site.description || t('nav.tagline') }}</p>
        </component>
      </header>

      <SearchBar
        ref="searchBarRef"
        v-model="query"
        :search-engines="searchEngineSettings"
        :busy="unlocking"
        @submit="submitSearch"
        @engine-change="searchEngineTick++"
      />

      <HomeUrgentNoticeBar
        v-if="canEditAppearance"
        :items="homeUrgentNotifications"
        :overflow="homeUrgentOverflow"
        @select="markHomeNotificationRead"
      />

      <Transition name="navigation-reveal">
        <section v-if="payload && payload.access?.unlocked !== false" class="navigation-reveal-content" :class="{ 'is-organizing': organizing }">
          <p v-if="query.trim()" class="search-result-summary">
            {{ t('nav.localHits', { count: localMatchCount }) }}
          </p>

          <div v-if="organizing" class="organize-toolbar" role="status">
            <span>{{ t('nav.organizing') }}</span>
            <div>
              <a class="organize-icon-button" href="/admin/trash" :title="t('nav.openTrash')" :aria-label="t('nav.openTrash')"><Trash2 :size="16" /></a>
              <button class="organize-done-button" type="button" data-testid="finish-organizing" @click="exitOrganizeMode"><Check :size="16" />{{ t('nav.done') }}</button>
            </div>
          </div>

          <nav ref="tabsRef" data-scene-collider-id="folder-tabs" class="folder-tabs" :class="{ 'tabs-scrollable': tabsScrollable, 'is-organizing': organizing, 'notab-wraps': appearance.notabOverflow === 'wrap' }" aria-label="NoTab">
            <span class="tab-indicator" aria-hidden="true" :style="tabIndicatorStyle"></span>
            <span
              v-for="tab in categoryTabs"
              :key="tab.id"
              class="notab-shell"
              :class="{
                'is-organizing': organizing && tab.id !== 'all',
                'is-dragging-source': notabDrag?.folder.id === Number(tab.id),
                'drop-before': notabDrag?.targetNotabId === Number(tab.id) && notabDrag.targetSide === 'before',
                'drop-after': notabDrag?.targetNotabId === Number(tab.id) && notabDrag.targetSide === 'after',
              }"
              :data-notab-id="tab.id === 'all' ? undefined : tab.id"
            >
              <button
                type="button"
                class="notab-select"
                :class="{ active: tab.id === selectedCategoryId, 'is-organize-arming': tab.id === 'all' && organizeArming }"
                :aria-pressed="tab.id === selectedCategoryId"
                :data-testid="`category-tab-${tab.id}`"
                @pointerdown="onNotabPointerDown(tab.id, $event)"
                @pointermove="onNotabPointerMove"
                @pointerup="onNotabPointerEnd"
                @pointercancel="onNotabPointerEnd"
                @click="onNotabClick(tab.id, $event)"
                @contextmenu="(organizing || (tab.id === 'all' && canOrganize)) && $event.preventDefault()"
              >{{ tab.name }}</button>
              <button
                v-if="organizing && tab.id !== 'all'"
                class="notab-delete-button"
                type="button"
                :title="t('nav.deleteNotab')"
                :data-testid="`delete-notab-${tab.id}`"
                @pointerdown.stop
                @click.stop="requestNotabDelete(Number(tab.id))"
              ><Trash2 :size="11" /></button>
            </span>
            <span v-if="navigationEntries.length" class="tab-service-separator" aria-hidden="true"></span>
            <a
              v-for="entry in navigationEntries"
              :key="entry.id"
              class="tab-service-link"
              :href="entry.url"
              :target="entry.openInNewTab ? '_blank' : undefined"
              :rel="entry.openInNewTab ? 'noreferrer' : undefined"
              :data-testid="`navigation-entry-${entry.id}`"
            >
              <component :is="navigationEntryIcon(entry.icon)" :size="15" />
              <span>{{ entry.label }}</span>
            </a>
          </nav>

          <div class="adaptive-folder-grid">
            <FolderCard
              :username="username"
              v-for="(folder, index) in renderedFolders"
              :key="folder.id"
              :data-testid="`public-folder-card-${folder.id}`"
              :style="{ '--enter-delay': `${(index % 24) * 28}ms` }"
              :folder="folder"
              :depth="folderDepth(folder)"
              :highlight="normalizedQuery"
              :editable="canEditAppearance && !normalizedQuery && !accessLocked && !anyModalOpen && !movingBookmark && !movingFolder && !movingNotab"
              :organizing="organizing"
              :folder-draggable="Boolean(folder.parentId)"
              :dragging-link-id="bookmarkDrag?.link.id"
              :dragging-folder-id="folderDrag?.folder.id"
              :drop-active="bookmarkDrag?.targetFolderId === folder.id"
              :drop-link-id="bookmarkDrag?.targetFolderId === folder.id ? bookmarkDrag.targetLinkId : null"
              :drop-side="bookmarkDrag?.targetFolderId === folder.id ? bookmarkDrag.targetSide : ''"
              :folder-drop-side="folderDrag?.targetFolderId === folder.id ? folderDrag.targetSide : ''"
              @verify="verifying = $event"
              @expand="expandedFolder = $event"
              @bookmark-delete-request="requestBookmarkDelete"
              @bookmark-drag-start="onBookmarkDragStart"
              @folder-delete-request="requestFolderDelete"
              @folder-drag-start="onFolderDragStart"
            />
          </div>
          <button v-if="hasMoreFolders" ref="folderLoadSentinel" class="folder-load-more" type="button" @click="loadMoreFolders">
            {{ t('nav.loadMoreFolders') }}
          </button>
          <div v-if="query.trim() && !foldersWithLinks.length" class="public-empty-state">
            <p>{{ t('nav.noLocalHits') }}</p>
            <a v-if="externalSearchUrl" class="button external-search-cta" :href="externalSearchUrl">
              {{ t('nav.searchWith', { engine: externalSearchLabel, query: query.trim() }) }}
            </a>
          </div>
        </section>
      </Transition>
    </div>

    <FolderExpandModal v-if="expandedFolder" :folder="expandedFolder" :highlight="debouncedQuery" @close="expandedFolder = null" />

    <FolderUnlockModal v-if="verifying" :folder="verifying" :username="username" @close="verifying = null" @verified="onFolderVerified" />

    <BookmarkDeleteDialog
      v-if="pendingDelete"
      :link="pendingDelete.link"
      :label="pendingDelete.label"
      :kind="pendingDelete.kind"
      :busy="deletingItem"
      @cancel="pendingDelete = null"
      @confirm="confirmItemDelete"
    />

    <div
      v-if="dragPreview"
      class="bookmark-drag-preview"
      :style="{ transform: `translate3d(${dragPreview.x + 16}px, ${dragPreview.y + 16}px, 0)` }"
      aria-hidden="true"
    >
      <Link2 v-if="dragPreview.kind === 'bookmark'" :size="16" />
      <FolderIcon v-else-if="dragPreview.kind === 'folder'" :size="16" />
      <Layers3 v-else :size="16" />
      <span>{{ dragPreview.label }}</span>
    </div>

    <Transition name="bookmark-message">
      <p v-if="bookmarkMessage" class="bookmark-message" :class="bookmarkMessage.kind" role="status" aria-live="polite">
        {{ bookmarkMessage.text }}
      </p>
    </Transition>

    <AppearanceSettingsDrawer
      v-if="payload?.site && canEditAppearance"
      :open="appearanceOpen"
      :site="payload.site"
      @close="closeAppearance"
      @preview="onAppearancePreview"
      @saved="onAppearanceSaved"
    />
  </main>

  <main
    v-else-if="navigation.error"
    class="nav-page public-glass-page navigation-load-error-page"
    :data-color-mode="resolvedMode"
  >
    <div class="public-load-error" role="alert">
      <p>{{ navigation.error }}</p>
      <button class="button" type="button" @click="load">{{ t('nav.reload') }}</button>
    </div>
  </main>
</template>

<style scoped>
.nav-page {
  background: var(--nav-bg-color, #090a0f);
  font-family: var(--public-font-family, inherit);
  isolation: isolate;
  line-height: var(--public-line-height, 1.5);
  min-height: 100dvh;
  padding: 48px 0 80px;
  position: relative;
}

.navigation-load-error-page {
  display: grid;
  padding: 24px;
  place-items: center;
}

.bookmark-drag-preview {
  align-items: center;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  background: rgba(var(--public-card-color-rgb, 247, 248, 251), calc(var(--public-card-opacity, 0.26) + 0.42));
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.56);
  border-radius: 8px;
  box-shadow: 0 16px 42px rgba(var(--public-shadow-rgb), 0.28);
  color: var(--public-bookmark-text, var(--public-page-text));
  display: flex;
  gap: 8px;
  left: 0;
  max-width: min(260px, calc(100vw - 32px));
  padding: 9px 12px;
  pointer-events: none;
  position: fixed;
  top: 0;
  z-index: 170;
}

:global(body.organize-dragging) {
  cursor: default;
  user-select: none;
}

.bookmark-drag-preview span {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-message {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(var(--public-overlay-rgb), 0.9);
  border: 1px solid rgba(var(--accent-bright-rgb), 0.42);
  border-radius: 8px;
  bottom: 24px;
  color: var(--public-page-text);
  font-size: 13px;
  font-weight: 700;
  left: 50%;
  margin: 0;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 14px;
  position: fixed;
  transform: translateX(-50%);
  z-index: 190;
}

.bookmark-message.error {
  border-color: rgba(244, 63, 94, 0.58);
}

.bookmark-message-enter-active,
.bookmark-message-leave-active {
  transition: opacity 0.2s ease, transform 0.24s ease;
}

.bookmark-message-enter-from,
.bookmark-message-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}

.public-glass-page {
  --public-mode-scrim: rgba(8, 12, 18, 0.02);
  --public-card-color-rgb: 247, 248, 251;
  --public-card-opacity: 0.26;
  --public-search-color-rgb: 247, 248, 251;
  --public-search-blur: 20px;
  --public-tab-color-rgb: 247, 248, 251;
  --public-bookmark-text: #ffffff;
  --public-bookmark-text-size: 14px;
  --public-notab-text: #ffffff;
  --public-notab-text-rgb: 255, 255, 255;
  --public-notab-text-size: 15px;
  --public-folder-text: #ffffff;
  --public-folder-text-rgb: 255, 255, 255;
  --public-folder-text-size: 18px;
  --public-category-text: #ffffff;
  --public-page-text: #f3f4f6;
  --public-page-text-rgb: 243, 244, 246;
  --public-border-rgb: 255, 255, 255;
  --public-highlight-rgb: 255, 255, 255;
  --public-hover-rgb: 255, 255, 255;
  --public-shadow-rgb: 0, 0, 0;
  --public-overlay-rgb: 8, 12, 18;
  --public-accent-ink: #052e2b;
  background:
    radial-gradient(circle at 14% 10%, rgba(var(--accent-bright-rgb), 0.14), transparent 28%),
    linear-gradient(135deg, rgba(var(--public-highlight-rgb), 0.08), transparent 42%, rgba(var(--accent-rgb), 0.08)),
    var(--nav-bg-color, #090a0f);
}

.nav-page::before {
  background-image: var(--nav-bg-image, none);
  background-position: var(--public-bg-position, center);
  background-repeat: no-repeat;
  background-size: var(--public-bg-size, cover);
  content: '';
  /* Only the user's own homepage background is filtered here; the themes ship no imagery. */
  filter: brightness(var(--public-bg-brightness, 100%)) blur(var(--public-bg-blur, 0px));
  /* Overhangs the viewport by the blur radius, or the blur would feather the page through
     around the edges. */
  inset: calc(-2 * var(--public-bg-blur, 0px));
  opacity: 0;
  pointer-events: none;
  position: fixed;
  transition: opacity 0.45s ease;
  z-index: 0;
}

.nav-page.nav-bg-visible::before {
  opacity: 1;
}

.public-glass-page::after {
  background-color: var(--public-mode-scrim);
  background-image: linear-gradient(180deg, rgba(var(--public-highlight-rgb), 0.05), transparent 34%, rgba(var(--public-overlay-rgb), 0.05));
  content: '';
  inset: 0;
  pointer-events: none;
  position: fixed;
  transition: background-color 0.32s ease;
  z-index: 0;
}

.nav-content {
  display: grid;
  gap: var(--public-search-grid-gap, 28px);
  margin: 0 auto;
  max-width: var(--public-content-max, 2600px);
  min-width: 0;
  padding: 0 var(--public-page-padding-x, 32px);
  position: relative;
  z-index: 2;
}

.navigation-locked .nav-content {
  align-content: center;
  min-height: calc(100dvh - 128px);
  width: min(100%, 1280px);
}

.navigation-locked .nav-header {
  min-height: 0;
}

.navigation-reveal-content {
  display: grid;
  gap: 28px;
  min-width: 0;
}

.organize-toolbar {
  align-items: center;
  backdrop-filter: blur(var(--public-search-blur, 20px));
  -webkit-backdrop-filter: blur(var(--public-search-blur, 20px));
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), calc(var(--public-search-opacity, 0.34) + 0.14));
  border: 1px solid rgba(var(--accent-bright-rgb), 0.48);
  border-radius: var(--public-card-radius, 8px);
  box-shadow: 0 10px 28px rgba(var(--public-shadow-rgb), 0.14);
  color: var(--public-page-text);
  display: flex;
  font-size: 13px;
  font-weight: 750;
  justify-content: space-between;
  margin: 0 auto -12px;
  min-height: 44px;
  padding: 5px 6px 5px 14px;
  width: min(100%, 1200px);
}

.organize-toolbar > div { display: flex; gap: 6px; }
.organize-icon-button,
.organize-done-button {
  align-items: center;
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.18);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.3);
  border-radius: 8px;
  color: var(--public-page-text);
  display: inline-flex;
  font: inherit;
  gap: 6px;
  height: 34px;
  justify-content: center;
  text-decoration: none;
}
.organize-icon-button { width: 34px; }
.organize-done-button { padding: 0 12px; }
.organize-icon-button:hover,
.organize-done-button:hover { background: rgba(var(--accent-rgb), 0.24); border-color: rgba(var(--accent-bright-rgb), 0.5); }

.navigation-reveal-enter-active {
  transition: opacity 0.55s ease, transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), filter 0.55s ease;
}

.navigation-reveal-enter-from {
  filter: blur(8px);
  opacity: 0;
  transform: translateY(28px);
}

.navigation-reveal-leave-active {
  transition: opacity 0.2s ease;
}

.navigation-reveal-leave-to {
  opacity: 0;
}

.public-corner-actions {
  --color-mode-border: rgba(var(--public-border-rgb), 0.3);
  --color-mode-hover: rgba(var(--accent-rgb), 0.28);
  --color-mode-popover: rgba(var(--public-overlay-rgb), 0.92);
  --color-mode-surface: rgba(var(--public-search-color-rgb, 247, 248, 251), var(--public-search-opacity, 0.34));
  --color-mode-text: rgba(var(--public-page-text-rgb), 0.92);
  align-items: flex-start;
  display: flex;
  gap: 8px;
  position: fixed;
  right: 20px;
  top: 20px;
  z-index: 20;
}

.portal-corner-link {
  align-items: center;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), var(--public-search-opacity, 0.34));
  border: 1px solid rgba(var(--public-border-rgb), 0.3);
  border-radius: 8px;
  box-shadow: 0 12px 34px rgba(var(--public-shadow-rgb), 0.18), inset 0 1px 0 rgba(var(--public-highlight-rgb), 0.24);
  color: rgba(var(--public-page-text-rgb), 0.92);
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-family: inherit;
  font-weight: 750;
  gap: 8px;
  max-width: min(280px, calc(100vw - 32px));
  min-height: 42px;
  padding: 0 14px;
  position: relative;
  transform: translateZ(0);
  transition:
    background-color 0.24s ease,
    border-color 0.24s ease,
    box-shadow 0.24s ease,
    transform 0.24s ease;
}

.portal-corner-link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.portal-corner-link:hover,
.portal-corner-link:focus-visible {
  background: rgba(var(--accent-rgb), 0.28);
  border-color: rgba(var(--accent-soft-rgb), 0.56);
  box-shadow: 0 16px 40px rgba(var(--public-shadow-rgb), 0.22), 0 0 0 3px rgba(var(--accent-rgb), 0.12);
  outline: none;
  transform: translateY(-2px);
}

.portal-corner-link:active {
  transform: translateY(0) scale(0.97);
}

.nav-header {
  display: grid;
  justify-items: center;
  gap: 14px;
  min-height: 140px;
  text-align: center;
}

.header-vibe {
  animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  color: inherit;
  display: grid;
  justify-items: center;
  max-width: min(760px, 100%);
  padding: 8px 20px 14px;
}

.header-vibe-link {
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transform: translateZ(0);
  transition:
    background-color 0.24s ease,
    box-shadow 0.24s ease,
    transform 0.24s ease;
}

.header-vibe-link:hover,
.header-vibe-link:focus-visible {
  background: rgba(var(--public-hover-rgb), 0.14);
  box-shadow: inset 0 0 0 1px rgba(var(--public-border-rgb), 0.2);
  transform: translateY(-2px);
}

.portal-center-image {
  background: rgba(var(--public-highlight-rgb), 0.28);
  border: 1px solid rgba(var(--public-border-rgb), 0.48);
  border-radius: 50%;
  box-shadow: 0 16px 38px rgba(var(--public-shadow-rgb), 0.22), inset 0 1px 0 rgba(var(--public-highlight-rgb), 0.34);
  display: inline-flex;
  height: 86px;
  margin-bottom: 12px;
  padding: 5px;
  position: relative;
  width: 86px;
}

.portal-center-image img {
  border-radius: 50%;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.portal-center-arrow {
  background: var(--accent);
  border: 2px solid rgba(var(--public-border-rgb), 0.92);
  border-radius: 50%;
  bottom: 0;
  color: var(--public-accent-ink, #052e2b);
  padding: 4px;
  position: absolute;
  right: -2px;
}

h1 {
  /* The setting is the base; the heading is still the largest thing on the page. */
  font-size: calc(var(--public-title-text-size, 30px) * 1.86);
  line-height: 1.1;
  margin: 0;
  font-weight: calc(var(--public-font-weight, 400) + 400);
  letter-spacing: 0;
  color: var(--public-title-text, var(--public-page-text, #f3f4f6));
}

/* Text shadows only earn their keep over a background image; on flat color they just blur. */
.nav-bg-visible h1 {
  text-shadow: 0 4px 16px rgba(var(--public-shadow-rgb), 0.4);
}

@media (max-width: 768px) {
  h1 {
    font-size: calc(var(--public-title-text-size, 30px) * 1.2);
  }
}

.nav-header p {
  color: rgba(var(--public-description-text-rgb, var(--public-page-text-rgb)), 0.8);
  font-size: var(--public-description-text-size, 14px);
  line-height: var(--public-line-height, 1.5);
  margin: 12px 0 0;
  max-width: 600px;
  font-weight: calc(var(--public-font-weight, 400) + 100);
}

.nav-bg-visible .nav-header p {
  text-shadow: 0 2px 8px rgba(var(--public-shadow-rgb), 0.3);
}

.search-result-summary {
  color: rgba(var(--public-page-text-rgb), 0.72);
  font-size: 13px;
  font-weight: 700;
  justify-self: center;
  margin: -10px 0 0;
}

.public-loading,
.public-load-error {
  justify-self: center;
  width: min(100%, 680px);
}

.public-loading {
  display: grid;
  gap: 10px;
}

.public-loading-bar {
  animation: public-loading-pulse 1.2s ease-in-out infinite alternate;
  background: rgba(var(--public-highlight-rgb), 0.2);
  border-radius: 6px;
  display: block;
  height: 12px;
}

.public-loading-bar:nth-child(2) {
  width: 82%;
}

.public-loading-bar:nth-child(3) {
  width: 64%;
}

.public-load-error {
  align-items: center;
  background: rgba(20, 22, 28, 0.84);
  border: 1px solid rgba(244, 63, 94, 0.32);
  border-radius: 8px;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 14px 16px;
}

.public-load-error p {
  color: #fecdd3;
  margin: 0;
}

.sr-only {
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  width: 1px;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.folder-tabs {
  backdrop-filter: blur(var(--public-search-blur, 20px));
  -webkit-backdrop-filter: blur(var(--public-search-blur, 20px));
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), var(--public-search-opacity, 0.34));
  border: var(--public-glass-border-width, 1px) solid
    rgba(var(--public-border-rgb), var(--public-glass-border-opacity, 0.3));
  border-radius: var(--public-search-radius, 28px);
  display: flex;
  flex-wrap: var(--public-notab-wrap, nowrap);
  gap: var(--public-notab-gap, 4px);
  justify-content: var(--public-notab-justify, safe center);
  margin: 8px auto;
  max-width: 100%;
  min-height: var(--public-notab-height, 38px);
  min-width: 0;
  overflow-x: var(--public-notab-overflow-x, auto);
  padding: 5px;
  width: min(100%, 1200px);
  box-shadow:
    0 8px var(--public-glass-shadow-spread, 30px)
      rgba(var(--public-shadow-rgb), calc(var(--public-glass-shadow-strength, 0.32) * 0.44)),
    inset 0 1px 0 rgba(var(--public-highlight-rgb), var(--public-glass-highlight, 0.26));
  position: sticky;
  top: 12px;
  z-index: 10;
}

.folder-tabs::-webkit-scrollbar {
  display: none;
}

/* Edge fade hints that more tabs are reachable by horizontal scroll */
.folder-tabs.tabs-scrollable {
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%);
  /* Keep a swipe past the last tab from being read as a browser back gesture. */
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  /* Leaves room so a scrolled-into-view tab never sits flush against the edge. */
  scroll-padding-inline: var(--public-notab-scroll-padding, 12px);
}

/* Wrapped tabs have nothing to scroll, so the edge fade would just clip the first and last. */
.folder-tabs.tabs-scrollable.notab-wraps {
  -webkit-mask-image: none;
  mask-image: none;
}

.tab-indicator {
  background: rgba(var(--accent-rgb), 0.22);
  border-bottom: var(--public-notab-indicator, 2px) solid rgba(var(--accent-rgb), 0.85);
  border-radius: max(0px, calc(var(--public-search-radius, 28px) - 4px));
  box-shadow: 0 0 16px rgba(var(--accent-rgb), 0.3);
  height: calc(100% - 10px);
  left: 0;
  pointer-events: none;
  position: absolute;
  top: 5px;
  transition:
    transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.2s ease;
  width: 0;
  will-change: transform, width;
}

.notab-shell {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
}

.notab-select {
  -webkit-touch-callout: none;
  align-items: center;
  border-radius: max(0px, calc(var(--public-search-radius, 28px) - 4px));
  display: inline-flex;
  flex: 0 0 auto;
  min-height: calc(var(--public-notab-height, 38px) - 10px);
  padding: 6px 14px;
  font-size: var(--public-notab-text-size, 15px);
  font-weight: 600;
  color: rgba(var(--public-notab-text-rgb, 255, 255, 255), 0.8);
  position: relative;
  transform: translateZ(0);
  transition:
    background-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 1;
}

.notab-select:hover {
  background: rgba(var(--public-hover-rgb), 0.28);
  color: var(--public-notab-text, #ffffff);
  transform: translateY(-1px);
}

.notab-select:active {
  transform: translateY(1px) scale(0.97);
  transition-duration: 0.12s;
}

.notab-select.is-organize-arming {
  animation: organize-arm 3s linear both;
}

@keyframes organize-arm {
  from { box-shadow: inset 0 0 0 0 rgba(var(--accent-rgb), 0.1); }
  to { box-shadow: inset 0 -36px 0 0 rgba(var(--accent-rgb), 0.34); }
}

.notab-shell.is-organizing {
  animation: notab-wiggle 0.32s ease-in-out infinite alternate;
}

.notab-shell.is-dragging-source { opacity: 0.24; }
.notab-shell.drop-before::before,
.notab-shell.drop-after::after {
  background: var(--accent-bright, #34d399);
  border-radius: 2px;
  content: '';
  height: 24px;
  position: absolute;
  top: 5px;
  width: 3px;
  z-index: 4;
}
.notab-shell.drop-before::before { left: -2px; }
.notab-shell.drop-after::after { right: -2px; }

.notab-delete-button {
  align-items: center;
  background: rgba(225, 29, 72, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 50%;
  color: #ffffff;
  display: inline-flex;
  height: 18px;
  justify-content: center;
  padding: 0;
  position: absolute;
  right: -4px;
  top: -5px;
  width: 18px;
  z-index: 5;
}

@keyframes notab-wiggle {
  from { transform: rotate(-0.7deg) translateY(-1px); }
  to { transform: rotate(0.7deg) translateY(1px); }
}

.folder-tabs.is-organizing .tab-service-link { opacity: 0.48; pointer-events: none; }

.tab-service-separator {
  align-self: center;
  background: rgba(var(--public-border-rgb), 0.42);
  flex: 0 0 1px;
  height: 20px;
  margin: 0 5px;
  position: relative;
  z-index: 1;
}

.tab-service-link {
  align-items: center;
  border-radius: max(0px, calc(var(--public-search-radius, 28px) - 4px));
  color: rgba(var(--public-notab-text-rgb, 255, 255, 255), 0.84);
  display: inline-flex;
  flex: 0 0 auto;
  font-size: var(--public-notab-text-size, 15px);
  font-weight: 650;
  gap: 6px;
  padding: 6px 12px;
  position: relative;
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
  z-index: 1;
}

.tab-service-link:hover,
.tab-service-link:focus-visible {
  background: rgba(var(--public-hover-rgb), 0.28);
  color: var(--public-notab-text, #ffffff);
  outline: none;
  transform: translateY(-1px);
}

.tab-service-link:active {
  transform: translateY(1px) scale(0.97);
}

.notab-select.active {
  color: var(--public-notab-text, #ffffff);
  text-shadow: 0 1px 8px rgba(var(--public-shadow-rgb), 0.16);
}

.public-empty-state {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.public-empty-state p {
  margin: 0;
}

.external-search-cta {
  font-size: 13.5px;
  min-height: 34px;
}

mark {
  background: rgba(var(--accent-rgb), 0.28);
  border-radius: 3px;
  color: inherit;
  padding: 0 1px;
}

.adaptive-folder-grid {
  align-items: start;
  display: grid;
  gap: var(--public-folder-gap-y, 24px) var(--public-folder-gap-x, 20px);
  /* The configured count is the ceiling; narrower viewports still step down below. */
  grid-template-columns: repeat(var(--public-folder-columns, 4), minmax(0, 1fr));
}

@media (max-width: 1800px) {
  .nav-content {
    padding: 0 min(24px, var(--public-page-padding-x, 32px));
  }

  .adaptive-folder-grid {
    grid-template-columns: repeat(min(3, var(--public-folder-columns, 4)), minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .nav-content {
    padding: 0 min(20px, var(--public-page-padding-x, 32px));
  }

  .adaptive-folder-grid {
    grid-template-columns: repeat(min(2, var(--public-folder-columns, 4)), minmax(0, 1fr));
  }
}

.folder-load-more {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), var(--public-search-opacity, 0.34));
  border: 1px solid rgba(var(--public-border-rgb), 0.28);
  border-radius: 8px;
  color: rgba(var(--public-page-text-rgb), 0.88);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  justify-self: center;
  min-height: 42px;
  padding: 0 18px;
  transition:
    background-color 0.24s ease,
    border-color 0.24s ease,
    transform 0.24s ease;
}

.folder-load-more:hover,
.folder-load-more:focus-visible {
  background: rgba(var(--accent-rgb), 0.26);
  border-color: rgba(var(--accent-soft-rgb), 0.5);
  outline: none;
  transform: translateY(-1px);
}

@keyframes slideDown {
  from { transform: translateY(-12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes public-loading-pulse {
  from { opacity: 0.45; }
  to { opacity: 0.9; }
}

@media (max-width: 640px) {
  .nav-page {
    padding: 32px 12px 64px;
  }

  .nav-content {
    padding: 0 16px;
    gap: 20px;
  }

  .nav-header,
  .adaptive-folder-grid {
    min-width: 0;
    width: 100%;
  }

  .adaptive-folder-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }

  .nav-header {
    justify-items: center;
    min-height: auto;
    text-align: center;
    margin-bottom: 8px;
  }

  .portal-corner-link {
    min-height: 40px;
    width: fit-content;
  }

  .public-corner-actions {
    justify-content: center;
    margin: 0 auto 18px;
    position: relative;
    right: auto;
    top: auto;
    width: fit-content;
    z-index: 30;
  }

  .portal-corner-link span {
    max-width: 140px;
  }

  .header-vibe {
    padding-left: 12px;
    padding-right: 12px;
  }

  .portal-center-image {
    height: 72px;
    width: 72px;
  }

  /*
   * The strip still breaks out of the content padding for extra width (it stays well short of the
   * actual viewport edge), so it keeps the theme's own pill radius from the base rule below instead
   * of forcing 0 — a straight-cornered strip on phones read as broken against the rounded search
   * bar and folder cards right above and below it.
   */
  .folder-tabs {
    margin: 4px -8px;
    max-width: calc(100% + 16px);
    width: calc(100% + 16px);
    border-left: 0;
    border-right: 0;
    top: 0;
  }

  /*
   * The 28px edge fade costs a fifth of a 280px strip and renders the first and last tab
   * unreadable while still leaving them tappable, so a phone shows a target it has hidden.
   * Native scrolling plus the indicator is enough of a hint at this width.
   */
  .folder-tabs.tabs-scrollable {
    -webkit-mask-image: none;
    mask-image: none;
  }

  /* Long labels stay on one line and stay scrollable rather than being clipped away. */
  .notab-select {
    white-space: nowrap;
  }

  .organize-toolbar {
    margin-left: 0;
    margin-right: 0;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .navigation-reveal-enter-active,
  .navigation-reveal-leave-active {
    transition: none;
  }

  .navigation-locked .nav-content {
    min-height: calc(100dvh - 96px);
  }

  .header-vibe,
  .portal-corner-link,
  .public-loading-bar,
  .notab-shell,
  .notab-select.is-organize-arming {
    animation: none;
  }

  .nav-page::before,
  .public-glass-page::after,
  .tab-indicator {
    transition: none;
  }
}
</style>
