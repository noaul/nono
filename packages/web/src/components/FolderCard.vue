<script setup lang="ts">
import { ExternalLink, Lock, Unlock } from 'lucide-vue-next';
import type { Folder } from '@/api/types';

defineProps<{ folder: Folder }>();
defineEmits<{ verify: [folder: Folder] }>();
</script>

<template>
  <section class="folder-card">
    <header>
      <div>
        <h2>{{ folder.name }}</h2>
        <p v-if="folder.description">{{ folder.description }}</p>
      </div>
      <button v-if="folder.locked" class="icon-button secondary" title="验证密码" @click="$emit('verify', folder)">
        <Lock :size="17" />
      </button>
      <Unlock v-else :size="17" />
    </header>
    <div v-if="folder.locked" class="locked">需要密码</div>
    <div v-else class="link-grid">
      <a v-for="link in folder.links || []" :key="link.id" class="link-item" :href="link.url" target="_blank" rel="noreferrer">
        <span>{{ link.name }}</span>
        <ExternalLink :size="14" />
      </a>
    </div>
  </section>
</template>

<style scoped>
.folder-card {
  backdrop-filter: blur(18px);
  background: rgba(12, 16, 24, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  display: grid;
  gap: 12px;
  padding: 16px;
}

header {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

h2 {
  font-size: 18px;
  margin: 0;
}

p {
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
  margin: 4px 0 0;
}

.link-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
}

.link-item,
.locked {
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-height: 40px;
  overflow: hidden;
  padding: 0 10px;
}

.link-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.locked {
  color: rgba(255, 255, 255, 0.72);
  justify-content: flex-start;
}
</style>
