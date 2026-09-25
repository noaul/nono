<script setup lang="ts">
import '@/styles/public.css';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Activity, ArrowUpRight, Check, FolderIcon, Layers3, Link2, LogIn, ServerCog, Settings, Star, Trash2, WalletCards } from 'lucide-vue-next';
import AppearanceSettingsDrawer from '@/components/AppearanceSettingsDrawer.vue';
import BookmarkDeleteDialog from '@/components/BookmarkDeleteDialog.vue';
import FolderCard from '@/components/FolderCard.vue';
import FolderExpandModal from '@/components/FolderExpandModal.vue';
import FolderUnlockModal from '@/components/FolderUnlockModal.vue';
import HomeNotificationBell from '@/components/HomeNotificationBell.vue';
import HomeUrgentNoticeBar from '@/components/HomeUrgentNoticeBar.vue';
import SearchBar from '@/components/SearchBar.vue';
import ThemeScene from '@/components/ThemeScene.vue';
import { buildSearchUrl } from '@/api/client';
import type { Folder, Link, Site } from '@/api/types';
import { useHomeAppearance } from '@/composables/useHomeAppearance';
import { useHomeFolders } from '@/composables/useHomeFolders';
import { useHomeNotifications } from '@/composables/useHomeNotifications';
import { useHomeOrganize } from '@/composables/useHomeOrganize';
import { useAuthStore } from '@/stores/auth';
import { useNavigationStore } from '@/stores/navigation';
import { getPortalSettings } from '@/utils/portal';
import { getNavigationEntries } from '@/utils/navigationEntries';
import { getEngine, getSearchEngineSettings, getSelectedEngineId, resolveSearchTemplate } from '@/utils/searchEngines';
import { getSiteDefaultLocale } from '@/utils/locale';
import { useI18n } from '@/composables/useI18n';

const route = useRoute();
const auth = useAuthStore();
const navigation = useNavigationStore();
const { t, setSiteDefaultLocale } = useI18n();
const query = ref('');
const verifying = ref<Folder | null>(null);
const expandedFolder = ref<Folder | null>(null);
const selectedCategoryId = ref<string>('all');
const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);
const tabsRef = ref<HTMLElement | null>(null);
const tabIndicatorStyle = ref<Record<string, string>>({ opacity: '0' });
const tabsScrollable = ref(false);
const appearanceOpen = ref(false);
const appearancePreview = ref<Site | null>(null);
const unlocking = ref(false);

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
  const shell = active.parentElement?.classList.contains('notab-shell') ? active.parentElement : null;
  // Tracks the row as well as the column, so a wrapped strip highlights the right line.
  tabIndicatorStyle.value = {
    opacity: '1',
    transform: `translate(${(shell?.offsetLeft || 0) + active.offsetLeft}px, ${(shell?.offsetTop || 0) + active.offsetTop}px)`,
    width: `${active.offsetWidth}px`,
    height: `${active.offsetHeight}px`,
  };
  keepActiveTabVisible(nav, active);
}

const username = computed(() => String(route.params.username || 'admin'));
const payload = computed(() => navigation.payload);
const {
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
} = useHomeFolders({ payload, query, selectedCategoryId, allTabLabel: () => t('nav.allTab') });
const visualSite = computed(() => appearancePreview.value || payload.value?.site || null);
const accessLocked = computed(() => Boolean(payload.value?.access?.required && !payload.value.access.unlocked));
const canEditAppearance = computed(() => auth.authenticated && auth.user?.id === payload.value?.site.userId);
const {
  resolvedMode,
  activeTheme,
  sceneIntensity,
  appearance,
  sceneTuning,
  activeBackgroundImage,
  loadedBackgroundImage,
  backgroundStyle,
} = useHomeAppearance({ visualSite, savedSite: computed(() => payload.value?.site), username });
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
const canOrganize = computed(() => canEditAppearance.value && !accessLocked.value && !normalizedQuery.value);
const {
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
} = useHomeOrganize({
  payload,
  canOrganize,
  selectedCategoryId,
  categoryFolders,
  otherModalOpen: () => Boolean(expandedFolder.value || verifying.value || appearanceOpen.value),
  selectCategory,
  resetFolderBatch,
  renderAllFolders,
  updateTabIndicator,
  reload: () => navigation.load(username.value),
  t,
});
// The public page owns the site payload, so it publishes the admin-chosen default language to
// the shared locale state. A visitor's own override still wins over it.
watch(() => payload.value?.site.settings, (settings) => {
  setSiteDefaultLocale(getSiteDefaultLocale(settings));
}, { immediate: true });
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
function selectCategory(id: string) {
  selectedCategoryId.value = id;
  resetFolderBatch();
}

async function load() {
  await navigation.load(username.value).catch(() => undefined);
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
watch(normalizedQuery, () => {
  if (normalizedQuery.value) exitOrganizeMode();
});
watch(
  () => [selectedCategoryId.value, categoryTabs.value.map((tab) => tab.id).join(',')],
  async () => {
    await nextTick();
    updateTabIndicator();
  },
  { immediate: false },
);
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('resize', updateTabIndicator);
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

          <nav ref="tabsRef" data-scene-collider-id="folder-tabs" class="folder-tabs" :class="{ 'tabs-scrollable': tabsScrollable, 'is-organizing': organizing }" aria-label="NoTab">
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

<style scoped src="./NavigationPage.css"></style>
