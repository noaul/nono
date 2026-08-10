<script setup lang="ts">
import BookmarkTransferPanel from '@/components/admin/BookmarkTransferPanel.vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();
</script>

<template>
  <div class="admin-page-stack automation-page">
    <BookmarkTransferPanel id="bookmark-import" />
  </div>
</template>
