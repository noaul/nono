import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import type { Folder, Link, NavigationPayload } from '@/api/types';

const FOLDER_BATCH = 24;

function normalizeSearchText(link: Link) {
  return `${link.name} ${link.description || ''} ${link.url}`.toLocaleLowerCase();
}

/**
 * What the homepage shows: the folder tree cut into NoTabs, filtered by the picked tab or by the
 * local search, and rendered in batches of 24 as the load-more sentinel scrolls into view.
 */
export function useHomeFolders(options: {
  payload: Ref<NavigationPayload | null>;
  query: Ref<string>;
  selectedCategoryId: Ref<string>;
  allTabLabel: () => string;
}) {
  const { payload, query, selectedCategoryId } = options;
  const debouncedQuery = ref('');
  const renderedFolderCount = ref(FOLDER_BATCH);
  const folderLoadSentinel = ref<HTMLElement | null>(null);
  const categorySelectionInitialized = ref(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let folderObserver: IntersectionObserver | null = null;

  watch(query, (value) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery.value = value;
    }, 150);
  });

  const allLinks = computed(() => payload.value?.folders.flatMap((folder) => folder.links || []) || []);
  const searchIndex = computed(() =>
    allLinks.value.map((link) => ({
      id: link.id,
      text: normalizeSearchText(link),
    })),
  );
  const normalizedQuery = computed(() => debouncedQuery.value.trim().toLocaleLowerCase());
  const matchedLinkIds = computed(() => {
    if (!normalizedQuery.value) return null;
    return new Set(searchIndex.value.filter((entry) => entry.text.includes(normalizedQuery.value)).map((entry) => entry.id));
  });
  const localMatchCount = computed(() => {
    return matchedLinkIds.value?.size ?? allLinks.value.length;
  });

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
  const renderedFolders = computed(() => foldersWithLinks.value.slice(0, renderedFolderCount.value));
  const hasMoreFolders = computed(() => renderedFolderCount.value < foldersWithLinks.value.length);
  const categoryTabs = computed(() => [
    { id: 'all', name: options.allTabLabel() },
    ...categoryFolders.value.map((folder) => ({ id: String(folder.id), name: folder.name })),
  ]);

  function folderDepth(folder: Folder) {
    return folderMetadata.value.depthById.get(folder.id) || 0;
  }

  function resetFolderBatch() {
    renderedFolderCount.value = FOLDER_BATCH;
  }

  /** Renders every card at once, for modes where a folder below the fold must still be reachable. */
  function renderAllFolders() {
    renderedFolderCount.value = Math.max(FOLDER_BATCH, foldersWithLinks.value.length);
  }

  function loadMoreFolders() {
    renderedFolderCount.value = Math.min(renderedFolderCount.value + FOLDER_BATCH, foldersWithLinks.value.length);
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

  watch(normalizedQuery, resetFolderBatch);
  watch(categoryFolders, (folders) => {
    if (!payload.value || categorySelectionInitialized.value) return;
    selectedCategoryId.value = folders[0] ? String(folders[0].id) : 'all';
    categorySelectionInitialized.value = true;
  }, { immediate: true });
  watch(folderLoadSentinel, observeFolderSentinel);
  onUnmounted(() => {
    clearTimeout(debounceTimer);
    folderObserver?.disconnect();
  });

  return {
    debouncedQuery,
    normalizedQuery,
    searchIndex,
    localMatchCount,
    categoryFolders,
    foldersWithLinks,
    renderedFolders,
    hasMoreFolders,
    categoryTabs,
    folderLoadSentinel,
    folderDepth,
    resetFolderBatch,
    renderAllFolders,
    loadMoreFolders,
  };
}
