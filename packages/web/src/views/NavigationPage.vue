<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Bookmark, X, Lock } from 'lucide-vue-next';
import FolderCard from '@/components/FolderCard.vue';
import FolderGlyph from '@/components/FolderGlyph.vue';
import SearchBar from '@/components/SearchBar.vue';
import { apiRequest, buildSearchUrl, jsonBody } from '@/api/client';
import type { Folder, Link } from '@/api/types';
import { useNavigationStore } from '@/stores/navigation';
import { getAppearanceSettings, toAppearanceCssVars } from '@/utils/appearance';
import { getFaviconUrl } from '@/utils/favicon';

const route = useRoute();
const navigation = useNavigationStore();
const query = ref('');
const password = ref('');
const verifying = ref<Folder | null>(null);
const expandedFolder = ref<Folder | null>(null);
const error = ref('');
const visibleBackgroundImage = ref('');
const loadedBackgroundImage = ref('');
const faviconErrors = ref<Record<string | number, boolean>>({});
let backgroundPreloadVersion = 0;

const username = computed(() => String(route.params.username || 'admin'));
const payload = computed(() => navigation.payload);
const allLinks = computed(() => payload.value?.folders.flatMap((folder) => folder.links || []) || []);
const searchIndex = computed(() =>
  allLinks.value.map((link) => ({
    id: link.id,
    text: normalizeSearchText(link),
  })),
);
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());
const matchedLinkIds = computed(() => {
  if (!normalizedQuery.value) return null;
  return new Set(searchIndex.value.filter((entry) => entry.text.includes(normalizedQuery.value)).map((entry) => entry.id));
});
const localMatchCount = computed(() => {
  return matchedLinkIds.value?.size ?? allLinks.value.length;
});
const backgroundStyle = computed(() => {
  const appearanceVars = toAppearanceCssVars(getAppearanceSettings(payload.value?.site.settings));
  if (!payload.value?.site) {
    return {
      ...appearanceVars,
      '--nav-bg-color': '#090a0f',
      '--nav-bg-image': 'none',
      '--public-glass-bg': 'rgba(255, 255, 255, 0.16)',
      color: '#f3f4f6',
    };
  }

  return {
    ...appearanceVars,
    '--nav-bg-color': payload.value.site.backgroundColor || '#090a0f',
    '--public-glass-bg': 'rgba(255, 255, 255, 0.16)',
    '--nav-bg-image': visibleBackgroundImage.value
      ? `linear-gradient(rgba(10, 11, 16, 0.06), rgba(10, 11, 16, 0.26)), url(${JSON.stringify(visibleBackgroundImage.value)})`
      : 'none',
    color: payload.value.site.fontColor || '#f3f4f6',
  };
});
const backgroundImageUrl = computed(() => payload.value?.site.backgroundImage || '');
const shownFolders = computed(() => {
  if (!payload.value || !matchedLinkIds.value) return payload.value?.folders || [];
  return payload.value.folders.map((folder) => ({
    ...folder,
    links: (folder.links || []).filter((link) => matchedLinkIds.value?.has(link.id)),
  }));
});
const foldersWithLinks = computed(() => shownFolders.value.filter((folder) => folder.locked || (folder.links?.length || 0) > 0 || !query.value.trim()));
const folderMetadata = computed(() => {
  const folders = payload.value?.folders || [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const depthById = new Map<string | number, number>();

  const getDepth = (folder: Folder) => {
    const cached = depthById.get(folder.id);
    if (cached !== undefined) return cached;

    let depth = 0;
    let parentId = folder.parentId || null;
    const visited = new Set<string | number>([folder.id]);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      depth += 1;
      parentId = parent.parentId || null;
    }
    depthById.set(folder.id, depth);
    return depth;
  };

  return {
    byId,
    depthById: new Map(folders.map((folder) => [folder.id, getDepth(folder)])),
  };
});
const expandedFavicons = computed(() => {
  const entries = (expandedFolder.value?.links || []).map((link) => [link.id, getFaviconUrl(link.url, link.icon)] as const);
  return new Map(entries);
});

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

function handleFaviconError(linkId: string | number) {
  faviconErrors.value[linkId] = true;
}

function submitSearch() {
  const q = query.value.trim();
  if (!q) return;
  const hasLocalMatch = (matchedLinkIds.value?.size || 0) > 0;
  if (!hasLocalMatch || payload.value?.site.localSearchFirst === false) {
    window.location.href = buildSearchUrl(q, payload.value?.site.searchUrlTemplate);
  }
}

async function verifyFolder() {
  if (!verifying.value) return;
  error.value = '';
  try {
    const result = await apiRequest<{ verified: boolean; links: Link[] }>(`/api/navigation/${username.value}/folder/${verifying.value.id}/verify`, {
      method: 'POST',
      body: jsonBody({ password: password.value }),
    });
    if (!result.verified) {
      error.value = '密码不正确';
      return;
    }
    verifying.value.links = result.links;
    verifying.value.locked = false;
    verifying.value = null;
    password.value = '';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '验证失败';
  }
}

function folderDepth(folder: Folder) {
  return folderMetadata.value.depthById.get(folder.id) || 0;
}

function parentFolderName(folder: Folder) {
  if (!folder.parentId) return '';
  return folderMetadata.value.byId.get(folder.parentId)?.name || '';
}

onMounted(load);
watch(username, load);
watch(backgroundImageUrl, preloadPublicBackground, { immediate: true });
onUnmounted(removeBackgroundHints);
</script>

<template>
  <main class="nav-page public-glass-page" :class="{ 'nav-bg-visible': visibleBackgroundImage, 'nav-bg-loaded': loadedBackgroundImage }" :style="backgroundStyle">
    <div class="nav-content">
      <header class="nav-header">
        <div class="header-vibe">
          <h1>{{ payload?.site.name || 'Nono' }}</h1>
          <p>{{ payload?.site.description || '一个可自托管的网址导航主页' }}</p>
        </div>
      </header>

      <SearchBar v-model="query" @submit="submitSearch" />

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

      <nav class="folder-tabs" aria-label="文件夹">
        <a v-for="folder in payload?.folders || []" :key="folder.id" :href="`#folder-${folder.id}`">
          {{ folder.name }}
        </a>
      </nav>

      <div class="adaptive-folder-grid">
        <FolderCard
          v-for="folder in foldersWithLinks"
          :key="folder.id"
          :data-testid="`public-folder-card-${folder.id}`"
          :folder="folder"
          :depth="folderDepth(folder)"
          :parent-name="parentFolderName(folder)"
          @verify="verifying = $event"
          @expand="expandedFolder = $event"
        />
      </div>
      <p v-if="query.trim() && !foldersWithLinks.length" class="public-empty-state">没有站内命中，按回车会使用外部搜索继续查找。</p>
    </div>

    <!-- Expanded Folder Modal -->
    <div v-if="expandedFolder" class="folder-expand-backdrop" @click.self="expandedFolder = null">
      <section class="folder-expand-modal" role="dialog" aria-modal="true" :aria-label="expandedFolder.name">
        <header class="folder-expand-head">
          <div class="expand-head-title">
            <FolderGlyph class="expand-folder-icon" :icon="expandedFolder.icon" :size="22" />
            <h2>{{ expandedFolder.name }}</h2>
          </div>
          <button class="folder-expand-close" type="button" title="关闭" @click="expandedFolder = null">
            <X :size="20" />
          </button>
        </header>

        <div class="expanded-link-grid">
          <a v-for="link in expandedFolder.links || []" :key="link.id" class="expanded-link" :href="link.url" target="_blank" rel="noreferrer">
            <span class="expanded-link-icon">
              <img
                v-if="expandedFavicons.get(link.id) && !faviconErrors[link.id]"
                :src="expandedFavicons.get(link.id)"
                alt=""
                loading="lazy"
                decoding="async"
                @error="handleFaviconError(link.id)"
              />
              <Bookmark v-else :size="20" />
            </span>
            <span class="expanded-link-copy">
              <strong>{{ link.name }}</strong>
              <small v-if="link.description">{{ link.description }}</small>
            </span>
          </a>
          <p v-if="!(expandedFolder.links || []).length" class="expanded-empty">这个文件夹还没有可展示的书签。</p>
        </div>
      </section>
    </div>

    <!-- Verify Folder Password Modal -->
    <div v-if="verifying" class="modal-backdrop" @click.self="verifying = null">
      <form class="modal" @submit.prevent="verifyFolder">
        <div class="modal-head">
          <div class="modal-icon-lock">
            <Lock :size="22" />
          </div>
          <h2>{{ verifying.name }}</h2>
        </div>
        <p v-if="verifying.passwordHint" class="password-hint">提示：{{ verifying.passwordHint }}</p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="field">
          <label>请输入文件夹密码</label>
          <input v-model="password" type="password" autofocus placeholder="••••••" />
        </div>
        <div class="toolbar modal-actions">
          <button class="button" type="submit">确认解锁</button>
          <button class="button secondary" type="button" @click="verifying = null">取消</button>
        </div>
      </form>
    </div>
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
  --public-glass-bg: rgba(255, 255, 255, 0.16);
  --public-card-opacity: 0.52;
  --public-search-blur: 14px;
  background:
    radial-gradient(circle at 14% 10%, rgba(52, 211, 153, 0.2), transparent 28%),
    linear-gradient(135deg, rgba(8, 12, 18, 0.18), rgba(8, 12, 18, 0.04) 42%, rgba(15, 118, 110, 0.12)),
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
  background:
    linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px);
  background-size: 44px 44px;
  content: '';
  inset: 0;
  opacity: 0.18;
  pointer-events: none;
  position: fixed;
  z-index: 0;
}

.nav-content {
  --folder-card-width: 445px;
  display: grid;
  gap: 28px;
  margin: 0 auto;
  max-width: 2048px;
  padding: 0 40px;
  position: relative;
  z-index: 1;
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
}

h1 {
  font-size: 56px;
  line-height: 1.1;
  margin: 0;
  font-weight: 900;
  letter-spacing: 0;
  color: #ffffff;
  text-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

@media (max-width: 768px) {
  h1 {
    font-size: 36px;
  }
}

.nav-header p {
  color: rgba(243, 244, 246, 0.8);
  font-size: 15px;
  margin: 12px 0 0;
  max-width: 600px;
  font-weight: 500;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.search-result-summary {
  color: rgba(243, 244, 246, 0.72);
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
  background: rgba(255, 255, 255, 0.16);
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

.public-empty-state {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(243, 244, 246, 0.8);
  font-size: 14px;
  font-weight: 600;
  justify-self: center;
  margin: 0;
  padding: 18px 22px;
  text-align: center;
}

.folder-tabs {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 99px;
  display: flex;
  gap: 4px;
  justify-content: center;
  margin: 8px auto;
  max-width: fit-content;
  overflow-x: auto;
  padding: 5px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255,255,255,0.16);
}

.folder-tabs::-webkit-scrollbar {
  display: none;
}

.folder-tabs a {
  border-radius: 99px;
  flex: 0 0 auto;
  padding: 6px 14px;
  font-size: 13.5px;
  font-weight: 600;
  color: rgba(243, 244, 246, 0.78);
  transform: translateZ(0);
  transition:
    background-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.folder-tabs a:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  transform: translateY(-1px);
}

.folder-tabs a:active {
  transform: translateY(1px) scale(0.97);
  transition-duration: 0.12s;
}

.adaptive-folder-grid {
  align-items: stretch;
  display: grid;
  gap: 38px 32px;
  grid-template-columns: repeat(auto-fit, var(--folder-card-width));
  justify-content: center;
}

/* Expanded Modal Details */
.folder-expand-backdrop {
  align-items: center;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: rgba(8, 10, 14, 0.75);
  display: grid;
  inset: 0;
  padding: 40px 36px;
  position: fixed;
  z-index: 100;
  animation: fadeIn 0.25s ease-out;
}

.folder-expand-modal {
  background: rgba(15, 18, 25, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.04);
  color: #f3f4f6;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 20px;
  margin: 0 auto;
  height: min(80vh, 760px);
  overflow: hidden;
  padding: 24px 32px;
  width: min(100%, 1200px);
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.folder-expand-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 16px;
}

.expand-head-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.expand-folder-icon {
  color: rgba(255, 255, 255, 0.92);
  font-size: 22px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
}

.folder-expand-head h2 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0;
  margin: 0;
  color: #ffffff;
}

.folder-expand-close {
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: inline-flex;
  height: 36px;
  justify-content: center;
  padding: 0;
  transform: translateZ(0);
  transition:
    background-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
  width: 36px;
}

.folder-expand-close:hover,
.folder-expand-close:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  transform: translateY(-1px) scale(1.03);
}

.folder-expand-close:active {
  transform: translateY(1px) scale(0.94);
  transition-duration: 0.12s;
}

.expanded-link-grid {
  align-content: start;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
  scrollbar-width: thin;
}

.expanded-link-grid::-webkit-scrollbar {
  width: 5px;
}

.expanded-link-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 99px;
}

.expanded-link {
  align-items: center;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  color: rgba(243, 244, 246, 0.9);
  display: grid;
  gap: 12px;
  grid-template-columns: 46px minmax(0, 1fr);
  min-height: 72px;
  padding: 12px;
  transition:
    background-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.expanded-link:hover,
.expanded-link:focus-visible {
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.25);
  color: #10b981;
  outline: none;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.08);
}

.expanded-link:active {
  transform: translateY(1px) scale(0.985);
  transition-duration: 0.12s;
}

.expanded-link:hover small,
.expanded-link:focus-visible small {
  color: rgba(16, 185, 129, 0.6);
}

.expanded-link-icon {
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  display: inline-flex;
  height: 44px;
  justify-content: center;
  width: 44px;
  color: rgba(255, 255, 255, 0.3);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.expanded-link-icon img {
  border-radius: 6px;
  height: 24px;
  object-fit: contain;
  width: 24px;
}

.expanded-link:hover .expanded-link-icon {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.2);
  color: #10b981;
  transform: scale(1.04);
}

.expanded-link-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.expanded-link strong,
.expanded-link small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expanded-link strong {
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: 0;
}

.expanded-link small {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  font-weight: 500;
}

.expanded-empty {
  color: rgba(255, 255, 255, 0.45);
  grid-column: 1 / -1;
  text-align: center;
  padding: 60px 0;
  font-size: 14px;
}

/* Modal password unlock */
.modal-backdrop {
  align-items: center;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(8, 10, 14, 0.7);
  display: grid;
  inset: 0;
  padding: 24px;
  position: fixed;
  z-index: 120;
  animation: fadeIn 0.2s ease-out;
}

.modal {
  background: rgba(17, 20, 28, 0.9);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  display: grid;
  gap: 20px;
  margin: 0 auto;
  max-width: 380px;
  padding: 28px;
  width: 100%;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.04);
  animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon-lock {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: grid;
  place-items: center;
}

.modal h2 {
  font-size: 18px;
  font-weight: 800;
  margin: 0;
  color: #ffffff;
}

.password-hint {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  margin: 0;
  line-height: 1.4;
  background: rgba(255, 255, 255, 0.02);
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid rgba(255, 255, 255, 0.2);
}

.modal-actions {
  margin-top: 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.modal-actions .button {
  width: 100%;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
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
    --folder-card-width: min(100%, 445px);
    padding: 0 8px;
    gap: 20px;
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

  .folder-tabs {
    margin: 4px -8px;
    border-radius: 0;
    max-width: calc(100% + 16px);
    width: calc(100% + 16px);
    border-left: 0;
    border-right: 0;
  }

  .folder-expand-backdrop {
    padding: 20px 12px;
  }

  .folder-expand-modal {
    height: calc(100dvh - 40px);
    padding: 16px;
    gap: 16px;
  }

  .folder-expand-head h2 {
    font-size: 18px;
  }

  .expanded-link-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .expanded-link {
    min-height: 64px;
    padding: 8px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .header-vibe,
  .folder-expand-backdrop,
  .folder-expand-modal,
  .modal-backdrop,
  .modal,
  .public-loading-bar {
    animation: none;
  }

  .nav-page::before {
    transition: none;
  }
}
</style>
