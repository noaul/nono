<script setup lang="ts">
import { ArrowUpDown, BookOpen, Layers, Link2, Trash2 } from '@lucide/vue';
import { computed } from 'vue';
import AdminTabs from '@/components/admin/AdminTabs.vue';
import { useI18n } from '@/composables/useI18n';

defineProps<{ active: 'notabs' | 'links' | 'reading' | 'import' | 'trash' }>();

const { t } = useI18n();

const items = computed(() => [
  { id: 'notabs', to: '/admin/notabs', label: t('admin.navNotabs'), icon: Layers },
  { id: 'links', to: '/admin/links', label: t('admin.navLinks'), icon: Link2 },
  { id: 'reading', to: '/admin/reading', label: t('admin.navReading'), icon: BookOpen },
  { id: 'import', to: '/admin/import', label: t('admin.navImport'), icon: ArrowUpDown },
  { id: 'trash', to: '/admin/trash', label: t('admin.navTrash'), icon: Trash2 },
]);
</script>

<template>
  <AdminTabs :items="items" :active="active" :label="t('admin.navContentManagement')" />
</template>
