<script setup lang="ts">
import { Bookmark, Lock, Maximize2 } from 'lucide-vue-next';
import type { Folder } from '@/api/types';

defineProps<{ folder: Folder }>();
defineEmits<{ verify: [folder: Folder] }>();
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
      <Maximize2 v-else :size="17" />
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
  min-height: 286px;
}

.large-folder-title {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  min-height: 36px;
  padding: 0 8px;
}

h2 {
  font-size: 24px;
  letter-spacing: 8px;
  line-height: 1;
  margin: 0;
  text-align: center;
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
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 24px;
  display: grid;
  gap: 12px 28px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  min-height: 248px;
  padding: 26px 24px;
}

.large-link,
.locked {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 6px;
  display: flex;
  gap: 6px;
  justify-content: flex-start;
  min-height: 30px;
  overflow: hidden;
  padding: 2px 0;
}

.large-link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.locked {
  color: rgba(255, 255, 255, 0.72);
}
</style>
