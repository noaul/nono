<script setup lang="ts">
import { Folder, Layers, Link2 } from 'lucide-vue-next';
import { inject } from 'vue';
import { routerKey } from 'vue-router';
import { useI18n } from '@/composables/useI18n';

defineProps<{ active: 'notabs' | 'folders' | 'links' }>();

const { t } = useI18n();
const router = inject(routerKey, null);

const items = [
  { id: 'notabs' as const, to: '/admin/notabs', labelKey: 'admin.navNotabs' as const, icon: Layers },
  { id: 'folders' as const, to: '/admin/folders', labelKey: 'admin.navFolders' as const, icon: Folder },
  { id: 'links' as const, to: '/admin/links', labelKey: 'admin.navLinks' as const, icon: Link2 },
];

function navigate(event: MouseEvent, to: string) {
  if (!router || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  void router.push(to);
}
</script>

<template>
  <nav class="content-management-tabs" :aria-label="t('admin.navContentManagement')">
    <a
      v-for="item in items"
      :key="item.id"
      :href="item.to"
      class="content-management-tab"
      :class="{ active: active === item.id }"
      :aria-current="active === item.id ? 'page' : undefined"
      @click="navigate($event, item.to)"
    >
      <component :is="item.icon" :size="16" />
      <span>{{ t(item.labelKey) }}</span>
    </a>
  </nav>
</template>
