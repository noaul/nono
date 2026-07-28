<script setup lang="ts">
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import BookmarkTransferPanel from '@/components/admin/BookmarkTransferPanel.vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();
</script>

<template>
  <div class="admin-page-stack automation-page">
    <AdminPageHeader :eyebrow="t('admin.sectionAutomation')" :title="t('admin.navAutomation')" />
    <BookmarkTransferPanel id="bookmark-import" />
  </div>
</template>
