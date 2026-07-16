<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AdminLayout from '@/components/AdminLayout.vue';

const route = useRoute();
const title = computed(() => String(route.meta.title || '控制台'));
</script>

<template>
  <AdminLayout :title="title">
    <RouterView />
  </AdminLayout>
</template>
