<script setup lang="ts">
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import BookmarkTransferPanel from '@/components/admin/BookmarkTransferPanel.vue';
</script>

<template>
  <div class="admin-page-stack automation-page">
    <AdminPageHeader eyebrow="自动化" title="导入导出" />
    <BookmarkTransferPanel id="bookmark-import" />
  </div>
</template>
