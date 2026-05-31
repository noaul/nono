<script setup lang="ts">
import { Bookmark, Lock, Maximize2 } from 'lucide-vue-next';
import type { Folder } from '@/api/types';

defineProps<{ folder: Folder }>();
defineEmits<{ verify: [folder: Folder]; expand: [folder: Folder] }>();
</script>

<template>
  <section class="large-folder" :id="`folder-${folder.id}`">
    <header class="large-folder-title">
      <span class="title-spacer"></span>
      <div class="title-main">
        <span class="title-icon">{{ folder.icon || '□' }}</span>
        <h2>{{ folder.name }}</h2>
      </div>
      <button v-if="folder.locked" class="icon-button secondary" title="验证密码" @click="$emit('verify', folder)">
        <Lock :size="17" />
      </button>
      <button v-else class="folder-expand" type="button" title="展开文件夹" data-testid="folder-expand" @click="$emit('expand', folder)">
        <Maximize2 :size="17" />
      </button>
    </header>
    <div v-if="folder.locked" class="large-links locked">需要密码</div>
    <div v-else class="large-links">
      <a v-for="link in folder.links || []" :key="link.id" class="large-link" :href="link.url" target="_blank" rel="noreferrer">
        <Bookmark :size="16" />
        <span>{{ link.name }}</span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.large-folder {
  display: grid;
  gap: 10px;
  grid-template-rows: 38px 308px;
  height: 356px;
  min-width: 0;
  contain: layout paint style;
  contain-intrinsic-size: 445px 356px;
  content-visibility: auto;
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
  font-size: 24px;
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
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
}

.large-links {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.22), rgba(65, 84, 78, 0.42));
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 24px;
  display: grid;
  gap: 12px 10px;
  grid-auto-rows: 34px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  height: 308px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 26px 18px;
  scrollbar-color: rgba(255, 255, 255, 0.32) transparent;
  scrollbar-width: thin;
}

.large-link,
.locked {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: inherit;
  display: flex;
  gap: 6px;
  justify-content: flex-start;
  min-height: 30px;
  overflow: hidden;
  padding: 3px 8px;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.large-link:hover,
.large-link:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(125, 211, 252, 0.74);
  color: #7dd3fc;
  outline: none;
  transform: translateY(-1px);
}

.large-link:active {
  background: rgba(37, 147, 251, 0.86);
  border-color: rgba(255, 255, 255, 0.76);
  color: #ffffff;
  transform: translateY(0);
}

.large-link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.locked {
  color: rgba(255, 255, 255, 0.72);
}

.folder-expand {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  width: 32px;
}

.folder-expand:hover,
.folder-expand:focus-visible {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.34);
  color: #ffffff;
  outline: none;
}
</style>
