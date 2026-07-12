<script setup lang="ts">
import type { DuplicateLinkGroup } from '@/api/types';

defineProps<{ groups: DuplicateLinkGroup[]; folderName: (folderId: number) => string }>();
</script>

<template>
  <div v-if="groups.length" class="duplicate-panel">
    <div class="duplicate-panel-head">
      <h3>重复链接</h3>
      <span>{{ groups.length }} 组</span>
    </div>
    <div v-for="group in groups" :key="group.url" class="duplicate-group">
      <strong>{{ group.url }}</strong>
      <ul class="duplicate-list">
        <li v-for="link in group.links" :key="link.id">
          <span>{{ link.name }}</span>
          <small>{{ folderName(link.folderId) }}</small>
        </li>
      </ul>
    </div>
  </div>
</template>
