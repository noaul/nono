<script setup lang="ts">
import { watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const adminPaths = ['/admin', '/login', '/register', '/setup'];

watch(
  () => route.path,
  (path) => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) return;
    favicon.href = adminPaths.some((adminPath) => path === adminPath || path.startsWith(`${adminPath}/`))
      ? '/favicon-admin.svg'
      : '/favicon.svg';
  },
  { immediate: true },
);
</script>

<template>
  <router-view />
</template>
