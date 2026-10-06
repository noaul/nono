<script setup lang="ts">
import BookmarkTransferPanel from '@/components/admin/BookmarkTransferPanel.vue';
import ContentManagementTabs from '@/components/admin/ContentManagementTabs.vue';
import BookmarkExportSchedule from '@/components/admin/BookmarkExportSchedule.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
</script>

<template>
  <div class="admin-page-stack import-page">
    <ContentManagementTabs active="import" />
    <BookmarkTransferPanel id="bookmark-import" />
    <BookmarkExportSchedule v-if="auth.isAdmin" />
  </div>
</template>
