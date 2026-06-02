<script setup lang="ts">
import { ref } from 'vue';
import { Bookmark, Lock, Maximize2 } from 'lucide-vue-next';
import type { Folder } from '@/api/types';

defineProps<{ folder: Folder }>();
defineEmits<{ verify: [folder: Folder]; expand: [folder: Folder] }>();

const faviconErrors = ref<Record<string | number, boolean>>({});

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
  <section class="large-folder" :id="`folder-${folder.id}`">
    <header class="large-folder-title">
      <span class="title-spacer"></span>
      <div class="title-main">
        <span class="title-icon">{{ folder.icon || '📁' }}</span>
        <h2>{{ folder.name }}</h2>
      </div>
      <button v-if="folder.locked" class="icon-button secondary" title="验证密码" @click="$emit('verify', folder)">
        <Lock :size="17" />
      </button>
      <button v-else class="folder-expand" type="button" title="展开文件夹" data-testid="folder-expand" @click="$emit('expand', folder)">
        <Maximize2 :size="17" />
      </button>
    </header>
    <div v-if="folder.locked" class="large-links locked">
      <Lock :size="24" />
      <span>该分类已锁定，需要密码解锁</span>
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
        <Bookmark v-else :size="15" class="fallback-icon" />
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
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.large-folder:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35), 0 0 20px rgba(76, 201, 167, 0.12);
}

.large-folder-title {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  height: 38px;
  padding: 0 8px;
}

h2 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.title-main {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: center;
  min-width: 0;
}

.title-icon {
  font-size: 19px;
  letter-spacing: 0;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
}

.large-links {
  background: rgba(15, 19, 26, 0.55);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  display: grid;
  gap: 10px;
  grid-auto-rows: 40px;
  grid-template-columns: repeat(2, minmax(0, 1fr)); /* Replaced 3 columns with 2 columns to prevent title truncation! */
  height: 308px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 20px;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  scrollbar-width: thin;
  box-shadow: inset 0 0 12px rgba(255, 255, 255, 0.02);
}

.large-link {
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  color: rgba(238, 242, 246, 0.9);
  display: flex;
  gap: 8px;
  justify-content: flex-start;
  min-height: 40px;
  overflow: hidden;
  padding: 4px 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.large-link:hover,
.large-link:focus-visible {
  background: rgba(76, 201, 167, 0.1);
  border-color: rgba(76, 201, 167, 0.35);
  color: var(--accent);
  outline: none;
  transform: translateY(-1px);
}

.large-link:active {
  background: rgba(76, 201, 167, 0.2);
  transform: translateY(0);
}

.large-link span {
  font-size: 13.5px;
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
  color: rgba(255, 255, 255, 0.4);
}

.locked {
  background: rgba(15, 19, 26, 0.55);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
  align-items: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-weight: 500;
  height: 308px;
}

.locked span {
  color: rgba(255, 255, 255, 0.6);
}

.folder-expand {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
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
</style>
