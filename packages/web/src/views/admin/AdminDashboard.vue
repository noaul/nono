<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest } from '@/api/client';
import type { Folder, Link, Site } from '@/api/types';

const site = ref<Site | null>(null);
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);

const lockedCount = computed(() => folders.value.filter((folder) => folder.locked).length);

onMounted(async () => {
  [site.value, folders.value, links.value] = await Promise.all([
    apiRequest<Site>('/api/admin/site'),
    apiRequest<Folder[]>('/api/admin/folders'),
    apiRequest<Link[]>('/api/admin/links'),
  ]);
});
</script>

<template>
  <AdminLayout title="总览">
    <div class="grid three">
      <section class="panel">
        <div class="row-title">{{ folders.length }}</div>
        <div class="row-subtitle">文件夹</div>
      </section>
      <section class="panel">
        <div class="row-title">{{ links.length }}</div>
        <div class="row-subtitle">链接</div>
      </section>
      <section class="panel">
        <div class="row-title">{{ lockedCount }}</div>
        <div class="row-subtitle">加密文件夹</div>
      </section>
    </div>
    <section class="panel" style="margin-top: 14px">
      <div class="row-title">{{ site?.name || 'Nono' }}</div>
      <div class="row-subtitle">/{{ site?.slug || 'admin' }} · {{ site?.searchUrlTemplate || 'https://www.google.com/search?q={query}' }}</div>
    </section>
  </AdminLayout>
</template>
