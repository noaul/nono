<script setup lang="ts">
import { computed, ref } from 'vue';
import { Bookmark, Lock, Maximize2 } from 'lucide-vue-next';
import type { Folder } from '@/api/types';

const props = withDefaults(defineProps<{ folder: Folder; depth?: number; parentName?: string }>(), { depth: 0, parentName: '' });
defineEmits<{ verify: [folder: Folder]; expand: [folder: Folder] }>();

const faviconErrors = ref<Record<string | number, boolean>>({});
const folder = computed(() => props.folder);

function handleFaviconError(linkId: string | number) {
  faviconErrors.value[linkId] = true;
}

function getFaviconUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
  } catch (e) {
    return undefined;
  }
}
</script>

<template>
  <section class="large-folder" :id="`folder-${folder.id}`" :style="{ '--public-folder-depth': props.depth }">
    <header class="large-folder-title">
      <span class="title-spacer"></span>
      <div class="title-main">
        <span class="title-icon">{{ folder.icon || '📁' }}</span>
        <div class="title-copy">
          <small v-if="props.parentName" class="folder-parent-label">{{ props.parentName }}</small>
          <h2>{{ folder.name }}</h2>
        </div>
      </div>
      <button v-if="folder.locked" class="icon-button secondary lock-btn" title="验证密码" @click="$emit('verify', folder)">
        <Lock :size="16" />
      </button>
      <button v-else class="folder-expand" type="button" title="展开文件夹" data-testid="folder-expand" @click="$emit('expand', folder)">
        <Maximize2 :size="16" />
      </button>
    </header>
    <div v-if="folder.locked" class="large-links locked">
      <div class="lock-illustration">
        <Lock :size="28" />
      </div>
      <span>分类已锁定，请输入密码解锁</span>
    </div>
    <div v-else class="large-links">
      <a v-for="link in folder.links || []" :key="link.id" class="large-link" :href="link.url" target="_blank" rel="noreferrer">
        <img 
          v-if="getFaviconUrl(link.url) && !faviconErrors[link.id]" 
          :src="getFaviconUrl(link.url)" 
          class="link-favicon" 
          alt="" 
          @error="handleFaviconError(link.id)"
        />
        <Bookmark v-else :size="14" class="fallback-icon" />
        <span>{{ link.name }}</span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.large-folder {
  display: grid;
  gap: 12px;
  grid-template-rows: 38px 308px;
  height: 358px;
  min-width: 0;
  contain: layout paint style;
  contain-intrinsic-size: 445px 358px;
  content-visibility: auto;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.large-folder:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.25), 0 0 24px rgba(16, 185, 129, 0.08);
}

.large-folder-title {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  height: 38px;
  padding: 0 8px 0 calc(8px + var(--public-folder-depth, 0) * 12px);
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
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.title-main {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: center;
  min-width: 0;
}

.title-copy {
  display: grid;
  min-width: 0;
}

.folder-parent-label {
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-icon {
  font-size: 18px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}

.large-links {
  background: rgba(17, 20, 28, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  display: grid;
  gap: 8px;
  grid-auto-rows: 40px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  height: 308px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 16px;
  scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
  scrollbar-width: thin;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.02), 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* Custom scrollbar track details */
.large-links::-webkit-scrollbar {
  width: 5px;
}

.large-links::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 99px;
}

.large-links::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.24);
}

.large-link {
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  color: rgba(243, 244, 246, 0.85);
  display: flex;
  gap: 8px;
  justify-content: flex-start;
  min-height: 40px;
  overflow: hidden;
  padding: 4px 10px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.large-link:hover,
.large-link:focus-visible {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
  outline: none;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.08);
}

.large-link:active {
  background: rgba(16, 185, 129, 0.16);
  transform: translateY(0);
}

.large-link span {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-favicon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
  object-fit: contain;
  background: transparent;
}

.fallback-icon {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.3);
}

.locked {
  background: rgba(17, 20, 28, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
  align-items: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13.5px;
  font-weight: 500;
  height: 308px;
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
  color: #10b981;
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.2);
}

.locked span {
  color: rgba(255, 255, 255, 0.55);
}

.folder-expand {
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: inline-flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  transition: all 0.2s ease;
  width: 32px;
}

.folder-expand:hover,
.folder-expand:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  outline: none;
}

.lock-btn {
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  color: rgba(255, 255, 255, 0.5) !important;
}

.lock-btn:hover {
  background: rgba(16, 185, 129, 0.1) !important;
  border-color: rgba(16, 185, 129, 0.25) !important;
  color: #10b981 !important;
}
</style>
