<script setup lang="ts">
import BookmarkTransferPanel from '@/components/admin/BookmarkTransferPanel.vue';
import ContentManagementTabs from '@/components/admin/ContentManagementTabs.vue';
</script>

<template>
  <div class="admin-page-stack import-page">
    <ContentManagementTabs active="import" />
    <BookmarkTransferPanel id="bookmark-import" />
  </div>
</template>
