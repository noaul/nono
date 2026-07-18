<script setup lang="ts">
import '@/styles/public.css';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Activity, ArrowUpRight, Link2, Star, WalletCards } from 'lucide-vue-next';
import FolderCard from '@/components/FolderCard.vue';
import FolderExpandModal from '@/components/FolderExpandModal.vue';
import FolderUnlockModal from '@/components/FolderUnlockModal.vue';
import SearchBar from '@/components/SearchBar.vue';
import ThemeScene from '@/components/ThemeScene.vue';
import { buildSearchUrl } from '@/api/client';
import type { Folder, Link } from '@/api/types';
import { useNavigationStore } from '@/stores/navigation';
import { getAppearanceSettings, toAppearanceCssVars } from '@/utils/appearance';
import { getPortalSettings } from '@/utils/portal';
import { getNavigationEntries } from '@/utils/navigationEntries';
import { getEngine, getSearchEngineSettings, getSelectedEngineId, resolveSearchTemplate } from '@/utils/searchEngines';
import { getTheme, getThemeAccentVars, pageTextCssVars, themeCssVars } from '@/utils/themes';

const route = useRoute();
const navigation = useNavigationStore();
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

function updateTabIndicator() {
  const nav = tabsRef.value;
  tabsScrollable.value = Boolean(nav && nav.scrollWidth > nav.clientWidth + 1);
  const active = nav?.querySelector<HTMLElement>('button.active');
  if (!nav || !active) {
    tabIndicatorStyle.value = { opacity: '0' };
    return;
  }
  tabIndicatorStyle.value = {
    opacity: '1',
    transform: `translateX(${active.offsetLeft}px)`,
    width: `${active.offsetWidth}px`,
  };
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
const activeTheme = computed(() => {
  const settings = payload.value?.site.settings as { theme?: { id?: string } } | null | undefined;
  return getTheme(settings?.theme?.id);
});
const backgroundStyle = computed(() => {
  const appearanceVars = toAppearanceCssVars(getAppearanceSettings(payload.value?.site.settings));
  const publicThemeVars = activeTheme.value ? themeCssVars(activeTheme.value) : {};
  const accentVars = getThemeAccentVars(payload.value?.site.settings);
  if (!payload.value?.site) {
    return {
      ...appearanceVars,
      ...pageTextCssVars('#f3f4f6'),
      '--nav-bg-color': '#090a0f',
      '--nav-bg-image': 'none',
      color: '#f3f4f6',
    };
  }

  return {
    ...appearanceVars,
    ...publicThemeVars,
    ...accentVars,
    ...pageTextCssVars(payload.value.site.fontColor || activeTheme.value?.fontColor || '#f3f4f6'),
    '--nav-bg-color': payload.value.site.backgroundColor || '#090a0f',
    '--nav-bg-image': visibleBackgroundImage.value
      ? `linear-gradient(rgba(var(--public-overlay-rgb, 10, 11, 16), 0.04), rgba(var(--public-overlay-rgb, 10, 11, 16), 0.2)), url(${JSON.stringify(visibleBackgroundImage.value)})`
      : 'none',
    color: payload.value.site.fontColor || '#f3f4f6',
  };
});
const backgroundImageUrl = computed(() => payload.value?.site.backgroundImage || '');
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

// Categories = top-level folders; tabs show [全部, ...categories].
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
const anyModalOpen = computed(() => Boolean(expandedFolder.value || verifying.value));
const renderedFolders = computed(() => foldersWithLinks.value.slice(0, renderedFolderCount.value));
const hasMoreFolders = computed(() => renderedFolderCount.value < foldersWithLinks.value.length);
const categoryTabs = computed(() => [{ id: 'all', name: '全部' }, ...categoryFolders.value.map((folder) => ({ id: String(folder.id), name: folder.name }))]);

function selectCategory(id: string) {
  selectedCategoryId.value = id;
  renderedFolderCount.value = 24;
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
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.onload = () => {
    if (requestVersion === backgroundPreloadVersion) loadedBackgroundImage.value = url;
  };
  image.onerror = () => {
    if (requestVersion === backgroundPreloadVersion) {
      visibleBackgroundImage.value = '';
      loadedBackgroundImage.value = '';
    }
  };
  image.src = url;
}

function submitSearch() {
  const q = query.value.trim();
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
  return engine.template ? engine.label : '外部搜索';
});

function onFolderVerified(links: Link[]) {
  if (verifying.value) {
    verifying.value.links = links;
    verifying.value.locked = false;
  }
  verifying.value = null;
}

// Modals own Escape/focus handling; the page only locks body scroll while one is open.
watch(anyModalOpen, (open) => {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = open ? 'hidden' : '';
});

function onGlobalKeydown(event: KeyboardEvent) {
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
watch(backgroundImageUrl, preloadPublicBackground, { immediate: true });
watch(normalizedQuery, () => {
  renderedFolderCount.value = 24;
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
  folderObserver?.disconnect();
  removeBackgroundHints();
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('resize', updateTabIndicator);
  clearTimeout(debounceTimer);
  if (typeof document !== 'undefined') document.body.style.overflow = '';
});
</script>

<template>
  <main
    class="nav-page public-glass-page"
    :class="{ 'nav-bg-visible': visibleBackgroundImage, 'nav-bg-loaded': loadedBackgroundImage }"
    :style="backgroundStyle"
    :data-theme-tone="activeTheme?.tone"
  >
    <ThemeScene :theme="activeTheme" />
    <a class="portal-corner-link" data-testid="portal-corner-link" href="/admin" aria-label="后台管理">
      <span>后台管理</span>
      <ArrowUpRight :size="17" />
    </a>

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
          <h1>{{ payload?.site.name || 'Nono' }}</h1>
          <p>{{ payload?.site.description || '一个可自托管的网址导航主页' }}</p>
        </component>
      </header>

      <SearchBar ref="searchBarRef" v-model="query" :search-engines="searchEngineSettings" @submit="submitSearch" @engine-change="searchEngineTick++" />

      <div v-if="navigation.loading && !payload" class="public-loading" role="status" aria-live="polite">
        <span class="public-loading-bar"></span>
        <span class="public-loading-bar"></span>
        <span class="public-loading-bar"></span>
        <span class="sr-only">正在加载导航内容</span>
      </div>
      <div v-else-if="navigation.error && !payload" class="public-load-error" role="alert">
        <p>{{ navigation.error }}</p>
        <button class="button" type="button" @click="load">重新加载</button>
      </div>

      <p v-if="query.trim()" class="search-result-summary">
        站内命中 {{ localMatchCount }} 个链接
      </p>

      <nav ref="tabsRef" class="folder-tabs" :class="{ 'tabs-scrollable': tabsScrollable }" aria-label="notab">
        <span class="tab-indicator" aria-hidden="true" :style="tabIndicatorStyle"></span>
        <button
          v-for="tab in categoryTabs"
          :key="tab.id"
          type="button"
          :class="{ active: tab.id === selectedCategoryId }"
          :aria-pressed="tab.id === selectedCategoryId"
          :data-testid="`category-tab-${tab.id}`"
          @click="selectCategory(tab.id)"
        >
          {{ tab.name }}
        </button>
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
          v-for="folder in renderedFolders"
          :key="folder.id"
          :data-testid="`public-folder-card-${folder.id}`"
          :folder="folder"
          :depth="folderDepth(folder)"
          :highlight="normalizedQuery"
          @verify="verifying = $event"
          @expand="expandedFolder = $event"
        />
      </div>
      <button v-if="hasMoreFolders" ref="folderLoadSentinel" class="folder-load-more" type="button" @click="loadMoreFolders">
        继续加载更多文件夹
      </button>
      <div v-if="query.trim() && !foldersWithLinks.length" class="public-empty-state">
        <p>没有站内命中。</p>
        <a v-if="externalSearchUrl" class="button external-search-cta" :href="externalSearchUrl">
          用{{ externalSearchLabel }}搜索“{{ query.trim() }}” →
        </a>
      </div>
    </div>

    <FolderExpandModal v-if="expandedFolder" :folder="expandedFolder" :highlight="debouncedQuery" @close="expandedFolder = null" />

    <FolderUnlockModal v-if="verifying" :folder="verifying" :username="username" @close="verifying = null" @verified="onFolderVerified" />
  </main>
</template>

<style scoped>
.nav-page {
  background: var(--nav-bg-color, #090a0f);
  isolation: isolate;
  min-height: 100dvh;
  padding: 48px 0 80px;
  position: relative;
}

.public-glass-page {
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
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  content: '';
  inset: 0;
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
  background: linear-gradient(180deg, rgba(var(--public-highlight-rgb), 0.05), transparent 34%, rgba(var(--public-overlay-rgb), 0.05));
  content: '';
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: 0;
}

.nav-content {
  display: grid;
  gap: 28px;
  margin: 0 auto;
  max-width: 2600px;
  min-width: 0;
  padding: 0 32px;
  position: relative;
  z-index: 2;
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
  display: inline-flex;
  font-size: 13px;
  font-weight: 750;
  gap: 8px;
  max-width: min(280px, calc(100vw - 32px));
  min-height: 42px;
  padding: 0 14px;
  position: fixed;
  right: 20px;
  top: 20px;
  transform: translateZ(0);
  transition:
    background-color 0.24s ease,
    border-color 0.24s ease,
    box-shadow 0.24s ease,
    transform 0.24s ease;
  z-index: 20;
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
  font-size: 56px;
  line-height: 1.1;
  margin: 0;
  font-weight: 900;
  letter-spacing: 0;
  color: var(--public-page-text, #f3f4f6);
}

/* Text shadows only earn their keep over a background image; on flat color they just blur. */
.nav-bg-visible h1 {
  text-shadow: 0 4px 16px rgba(var(--public-shadow-rgb), 0.4);
}

@media (max-width: 768px) {
  h1 {
    font-size: 36px;
  }
}

.nav-header p {
  color: rgba(var(--public-page-text-rgb), 0.8);
  font-size: 15px;
  margin: 12px 0 0;
  max-width: 600px;
  font-weight: 500;
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
  border: 1px solid rgba(var(--public-border-rgb), 0.3);
  border-radius: var(--public-search-radius, 28px);
  display: flex;
  gap: 4px;
  justify-content: safe center;
  margin: 8px auto;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  padding: 5px;
  width: min(100%, 1200px);
  box-shadow: 0 8px 30px rgba(var(--public-shadow-rgb), 0.14), inset 0 1px 0 rgba(var(--public-highlight-rgb), 0.26);
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
}

.tab-indicator {
  background: rgba(var(--accent-rgb), 0.22);
  border-radius: max(0px, calc(var(--public-search-radius, 28px) - 4px));
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

.folder-tabs button {
  border-radius: max(0px, calc(var(--public-search-radius, 28px) - 4px));
  flex: 0 0 auto;
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

.folder-tabs button:hover {
  background: rgba(var(--public-hover-rgb), 0.28);
  color: var(--public-notab-text, #ffffff);
  transform: translateY(-1px);
}

.folder-tabs button:active {
  transform: translateY(1px) scale(0.97);
  transition-duration: 0.12s;
}

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

.folder-tabs button.active {
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
  gap: 24px 20px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (min-width: 2250px) {
  .adaptive-folder-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (min-width: 2500px) {
  .adaptive-folder-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

@media (max-width: 1800px) {
  .nav-content {
    padding: 0 24px;
  }

  .adaptive-folder-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .nav-content {
    padding: 0 20px;
  }

  .adaptive-folder-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
    margin: 0 auto;
    min-height: 40px;
    position: static;
    width: fit-content;
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

  .folder-tabs {
    margin: 4px -8px;
    border-radius: 0;
    max-width: calc(100% + 16px);
    width: calc(100% + 16px);
    border-left: 0;
    border-right: 0;
    top: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .header-vibe,
  .portal-corner-link,
  .public-loading-bar {
    animation: none;
  }

  .nav-page::before,
  .tab-indicator {
    transition: none;
  }
}
</style>
