<script setup lang="ts">
import { computed, ref } from 'vue';
import { Lock, Maximize2 } from 'lucide-vue-next';
import type { Folder } from '@/api/types';
import FaviconBadge from '@/components/FaviconBadge.vue';
import FolderGlyph from '@/components/FolderGlyph.vue';
import { getFaviconUrl } from '@/utils/favicon';
import { splitHighlight } from '@/utils/highlight';

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
</script>

<template>
  <section class="large-folder" :id="`folder-${folder.id}`" :style="{ '--public-folder-depth': props.depth }">
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
    <div v-else class="large-links folder-glass-panel">
      <a v-for="link in folder.links || []" :key="link.id" class="large-link" :href="link.url" target="_blank" rel="noreferrer">
        <img
          v-if="faviconUrls.get(link.id) && !faviconErrors[link.id]"
          :src="faviconUrls.get(link.id)"
          class="large-link-icon link-favicon"
          alt=""
          loading="lazy"
          decoding="async"
          @error="handleFaviconError(link.id)"
        />
        <FaviconBadge v-else class="large-link-icon fallback-link-icon" :name="link.name" :url="link.url" :size="18" />
        <span>
          <template v-for="(segment, index) in splitHighlight(link.name, props.highlight)" :key="index">
            <mark v-if="segment.hit">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template>
          </template>
        </span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.large-folder {
  display: grid;
  gap: 12px;
  grid-template-rows: 38px auto;
  height: auto;
  min-width: 0;
  contain: layout paint style;
  contain-intrinsic-size: 445px 268px;
  content-visibility: auto;
  position: relative;
  transition: transform 0.24s ease-out;
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
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
  margin: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #ffffff;
}

.nav-bg-visible .large-folder h2 {
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.title-main {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: center;
  min-width: 0;
}

.title-icon {
  color: rgba(255, 255, 255, 0.92);
  font-size: 18px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}

.large-links {
  background: rgba(10, 14, 18, 0.52);
  background: rgba(10, 14, 18, var(--public-card-opacity, 0.52));
  backdrop-filter: blur(var(--public-card-blur, 8px)) saturate(1.08);
  -webkit-backdrop-filter: blur(var(--public-card-blur, 8px)) saturate(1.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--public-card-radius, 8px);
  display: grid;
  gap: 8px;
  grid-auto-rows: 40px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  height: 218px;
  max-height: 218px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
  scrollbar-color: rgba(255, 255, 255, 0.24) transparent;
  scrollbar-width: thin;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(255, 255, 255, 0.03),
    0 14px 34px rgba(0, 0, 0, 0.1);
  transition:
    background-color 0.34s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.34s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.large-folder:hover .large-links,
.large-folder:focus-within .large-links {
  background: rgba(10, 14, 18, 0.68);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 16px 36px rgba(0, 0, 0, 0.14);
}

.large-link {
  align-items: center;
  background: rgba(255, 255, 255, 0);
  border: 1px solid rgba(255, 255, 255, 0);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.94);
  display: flex;
  gap: 8px;
  justify-content: flex-start;
  min-height: 40px;
  min-width: 0;
  overflow: hidden;
  padding: 4px 10px;
  transition:
    background-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.large-link:hover,
.large-link:focus-visible {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.18);
  color: #ffffff;
  outline: none;
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.large-link:active {
  background: rgba(255, 255, 255, 0.18);
  transform: translateY(0) scale(0.985);
  transition-duration: 0.12s;
}

.large-link span {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.large-link-icon {
  flex-shrink: 0;
  color: currentColor;
  opacity: 0.96;
}

.link-favicon {
  border-radius: 4px;
  height: 18px;
  object-fit: contain;
  width: 18px;
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
  color: rgba(255, 255, 255, 0.4);
  font-size: 13.5px;
  font-weight: 500;
  height: 218px;
  padding: 24px;
  text-align: center;
}

.lock-illustration {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.45);
  transition: var(--transition-smooth);
}

.locked:hover .lock-illustration {
  transform: scale(1.05);
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.06);
  border-color: rgba(var(--accent-rgb), 0.2);
}

.locked span {
  color: rgba(255, 255, 255, 0.55);
}

.folder-expand,
.lock-btn {
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.62);
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
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.36);
  color: #ffffff;
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
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.62);
}

.icon-button.secondary.lock-btn:hover {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: rgba(var(--accent-rgb), 0.25);
  color: var(--accent);
}

@media (max-width: 640px) {
  .large-folder {
    contain-intrinsic-size: auto 268px;
    grid-template-rows: 38px auto;
    height: auto;
  }

  .large-links {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    height: 218px;
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

  .large-folder:hover,
  .large-link:hover,
  .large-link:focus-visible {
    transform: none;
  }
}
</style>
