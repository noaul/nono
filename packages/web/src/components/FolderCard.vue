<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { Lock, Maximize2 } from 'lucide-vue-next';
import type { Folder } from '@/api/types';
import FaviconBadge from '@/components/FaviconBadge.vue';
import FolderGlyph from '@/components/FolderGlyph.vue';
import { getFaviconUrl } from '@/utils/favicon';
import { splitHighlight } from '@/utils/highlight';
import { compactBookmarkLabel } from '@/utils/bookmark-name';

const props = withDefaults(defineProps<{ folder: Folder; depth?: number; highlight?: string }>(), {
  depth: 0,
  highlight: '',
});
defineEmits<{ verify: [folder: Folder]; expand: [folder: Folder] }>();

const faviconErrors = ref<Record<string | number, boolean>>({});
const folder = computed(() => props.folder);
const faviconUrls = computed(() => new Map((folder.value.links || []).map((link) => [link.id, getFaviconUrl(link.url, link.icon)])));

function handleFaviconError(linkId: string | number) {
  faviconErrors.value[linkId] = true;
}

// Pointer spotlight only earns its keep on precise hover devices with motion allowed.
const spotlightEnabled =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const spotStyle = ref<Record<string, string>>({});
let spotFrame = 0;
let pendingSpot: { x: number; y: number } | null = null;

function onCardPointermove(event: PointerEvent) {
  if (!spotlightEnabled || !(event.currentTarget instanceof HTMLElement)) return;
  const rect = event.currentTarget.getBoundingClientRect();
  pendingSpot = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  if (spotFrame) return;
  spotFrame = requestAnimationFrame(() => {
    spotFrame = 0;
    if (!pendingSpot) return;
    spotStyle.value = {
      '--spot-x': `${Math.round(pendingSpot.x)}px`,
      '--spot-y': `${Math.round(pendingSpot.y)}px`,
      '--spot-alpha': '1',
    };
  });
}

function onCardPointerleave() {
  if (!spotlightEnabled) return;
  pendingSpot = null;
  spotStyle.value = { ...spotStyle.value, '--spot-alpha': '0' };
}

onUnmounted(() => {
  if (spotFrame) cancelAnimationFrame(spotFrame);
});
</script>

<template>
  <section
    class="large-folder"
    :id="`folder-${folder.id}`"
    :style="[{ '--public-folder-depth': props.depth }, spotStyle]"
    @pointermove="onCardPointermove"
    @pointerleave="onCardPointerleave"
  >
    <header class="large-folder-title">
      <span class="title-spacer" aria-hidden="true"></span>
      <div class="title-main">
        <FolderGlyph class="title-icon" :icon="folder.icon" :size="18" />
        <h2>{{ folder.name }}</h2>
      </div>
      <button v-if="folder.locked" class="icon-button secondary lock-btn" title="验证密码" @click="$emit('verify', folder)">
        <Lock :size="16" />
      </button>
      <button v-else class="folder-expand" type="button" title="展开文件夹" data-testid="folder-expand" @click="$emit('expand', folder)">
        <Maximize2 :size="16" />
      </button>
    </header>
    <div v-if="folder.locked" class="large-links folder-glass-panel locked">
      <div class="lock-illustration">
        <Lock :size="28" />
      </div>
      <span>分类已锁定，请输入密码解锁</span>
    </div>
    <div v-else class="large-links folder-glass-panel" :class="{ 'is-scrollable': (folder.links || []).length > 15 }">
      <a v-for="link in folder.links || []" :key="link.id" class="large-link" :href="link.url" :title="link.name" target="_blank" rel="noreferrer">
        <img
          v-if="faviconUrls.get(link.id) && !faviconErrors[link.id]"
          :src="faviconUrls.get(link.id)"
          class="large-link-icon link-favicon"
          alt=""
          loading="lazy"
          decoding="async"
          @error="handleFaviconError(link.id)"
        />
        <FaviconBadge v-else class="large-link-icon fallback-link-icon" :name="link.name" :url="link.url" :size="16" />
        <span>
          <template v-for="(segment, index) in splitHighlight(compactBookmarkLabel(link.name), props.highlight)" :key="index">
            <mark v-if="segment.hit">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template>
          </template>
        </span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.large-folder {
  animation: folder-card-enter 0.45s var(--nono-ease-spring, cubic-bezier(0.34, 1.36, 0.44, 1)) both;
  animation-delay: var(--enter-delay, 0ms);
  display: grid;
  gap: 12px;
  grid-template-rows: 38px auto;
  height: auto;
  min-width: 0;
  contain: layout paint style;
  contain-intrinsic-size: 398px 264px;
  content-visibility: auto;
  position: relative;
  transition: transform 0.24s ease-out;
}

@keyframes folder-card-enter {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Pointer spotlight follows --spot-x/--spot-y from script; sits above the glass, below clicks. */
.large-folder::after {
  background: radial-gradient(
    220px circle at var(--spot-x, 50%) var(--spot-y, 50%),
    rgba(var(--accent-bright-rgb, 52, 211, 153), 0.15),
    transparent 65%
  );
  border-radius: var(--public-card-radius, 8px);
  content: '';
  inset: 0;
  opacity: var(--spot-alpha, 0);
  pointer-events: none;
  position: absolute;
  transition: opacity 0.35s ease;
  z-index: 1;
}

.large-folder:hover {
  transform: translateY(-2px);
}

.large-folder-title {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  height: 38px;
  padding: 0 8px 0 calc(8px + var(--public-folder-depth, 0) * 12px);
  position: relative;
  z-index: 2;
}

h2 {
  color: var(--public-folder-text, #ffffff);
  font-size: var(--public-folder-text-size, 18px);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
  margin: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-bg-visible .large-folder h2 {
  text-shadow: 0 2px 8px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.3);
}

.title-main {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: center;
  min-width: 0;
}

.title-icon {
  color: rgba(var(--public-folder-text-rgb, 255, 255, 255), 0.92);
  font-size: 18px;
  filter: drop-shadow(0 2px 4px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.2));
}

.large-links {
  background: rgba(var(--public-card-color-rgb, 247, 248, 251), var(--public-card-opacity, 0.26));
  backdrop-filter: blur(var(--public-card-blur, 18px)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--public-card-blur, 18px)) saturate(1.2);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.34);
  border-radius: var(--public-card-radius, 8px);
  display: grid;
  gap: 8px 4px;
  grid-auto-rows: 30px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  height: 214px;
  max-height: 214px;
  overflow-x: hidden;
  overflow-y: hidden;
  padding: 15px 4px 15px 16px;
  scrollbar-color: rgba(var(--public-border-rgb, 255, 255, 255), 0.32) transparent;
  scrollbar-width: thin;
  box-shadow:
    inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), 0.42),
    inset 0 -1px 0 rgba(var(--public-border-rgb, 255, 255, 255), 0.1),
    0 14px 34px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.1);
  transition:
    background-color 0.34s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.34s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.large-folder:hover .large-links,
.large-folder:focus-within .large-links {
  background: rgba(var(--public-card-color-rgb, 247, 248, 251), calc(var(--public-card-opacity, 0.26) + 0.08));
  border-color: rgba(var(--public-border-rgb, 255, 255, 255), 0.5);
  box-shadow:
    inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), 0.52),
    inset 0 -1px 0 rgba(var(--public-border-rgb, 255, 255, 255), 0.12),
    0 16px 36px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.12);
}

.large-links.is-scrollable {
  overflow-y: auto;
  overscroll-behavior: contain;
}

.large-link {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.94);
  display: flex;
  gap: 2px;
  justify-content: flex-start;
  min-height: 30px;
  min-width: 0;
  overflow: hidden;
  padding: 2px 0 2px 5px;
  transition:
    background-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.large-link:hover,
.large-link:focus-visible {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.3);
  border-color: rgba(var(--public-border-rgb, 255, 255, 255), 0.28);
  color: var(--public-bookmark-text, #ffffff);
  outline: none;
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.13), inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), 0.18);
}

.large-link:active {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.42);
  transform: translateY(0) scale(0.985);
  transition-duration: 0.12s;
}

.large-link span {
  font-size: var(--public-bookmark-text-size, 14px);
  font-weight: 600;
  letter-spacing: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}

.large-link-icon {
  flex-shrink: 0;
  color: currentColor;
  opacity: 0.96;
}

.link-favicon {
  border-radius: 4px;
  height: 16px;
  object-fit: contain;
  width: 16px;
}

.fallback-link-icon {
  opacity: 0.82;
}

mark {
  background: rgba(var(--accent-rgb), 0.28);
  border-radius: 3px;
  color: inherit;
  padding: 0 1px;
}

.locked {
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
  align-items: center;
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.48);
  font-size: 13.5px;
  font-weight: 500;
  height: 214px;
  padding: 24px;
  text-align: center;
}

.lock-illustration {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.08);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.12);
  border-radius: 8px;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.52);
  transition: var(--transition-smooth);
}

.locked:hover .lock-illustration {
  transform: scale(1.05);
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.06);
  border-color: rgba(var(--accent-rgb), 0.2);
}

.locked span {
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.68);
}

.folder-expand,
.lock-btn {
  align-items: center;
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.16);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.24);
  border-radius: 8px;
  color: rgba(var(--public-folder-text-rgb, 255, 255, 255), 0.72);
  cursor: pointer;
  display: inline-flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  position: static;
  transition:
    background-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  width: 32px;
}

.folder-expand:hover,
.folder-expand:focus-visible,
.lock-btn:hover,
.lock-btn:focus-visible {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.32);
  border-color: rgba(var(--public-border-rgb, 255, 255, 255), 0.48);
  color: var(--public-folder-text, #ffffff);
  outline: none;
  transform: translateY(-1px) scale(1.03);
}

.folder-expand:active,
.lock-btn:active {
  transform: translateY(0) scale(0.94);
  transition-duration: 0.12s;
}

/* Outrank base.css .icon-button.secondary without !important */
.icon-button.secondary.lock-btn {
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.16);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.24);
  color: rgba(var(--public-folder-text-rgb, 255, 255, 255), 0.72);
}

.icon-button.secondary.lock-btn:hover {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: rgba(var(--accent-rgb), 0.25);
  color: var(--accent);
}

@media (max-width: 640px) {
  .large-folder {
    contain-intrinsic-size: auto 264px;
    grid-template-rows: 38px auto;
    height: auto;
  }

  .large-links {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    height: 214px;
  }

  .large-links.locked {
    min-height: 128px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .large-folder,
  .large-link,
  .folder-expand,
  .lock-btn,
  .lock-illustration {
    transition: none;
  }

  .large-folder {
    animation: none;
  }

  .large-folder::after {
    transition: none;
  }

  .large-folder:hover,
  .large-link:hover,
  .large-link:focus-visible {
    transform: none;
  }
}
</style>
