<script setup lang="ts">
import type { DuplicateLinkGroup } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

defineProps<{ groups: DuplicateLinkGroup[]; folderName: (folderId: number) => string }>();
</script>

<template>
  <div v-if="groups.length" class="duplicate-panel">
    <div class="duplicate-panel-head">
      <h3>{{ t('ui.duplicateLinks') }}</h3>
      <span>{{ t('ui.groupCount', { count: groups.length }) }}</span>
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
