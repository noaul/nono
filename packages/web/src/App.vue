<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const adminPaths = ['/admin', '/login', '/register', '/setup'];
const isAdminRoute = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'));

watch(
  () => route.path,
  (path) => {
    const isAdmin = adminPaths.some((adminPath) => path === adminPath || path.startsWith(`${adminPath}/`));
    const variant = isAdmin ? '-admin' : '';

    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((favicon) => {
      const size = favicon.sizes.value === '192x192' ? 192 : 32;
      favicon.href = `/favicon${variant}-${size}.png${isAdmin ? '' : '?v=20260717b'}`;
    });

    const appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleTouchIcon) appleTouchIcon.href = `/apple-touch-icon${variant}.png${isAdmin ? '' : '?v=20260717b'}`;
  },
  { immediate: true },
);
</script>

<template>
  <router-view v-slot="{ Component }">
    <component v-if="isAdminRoute" :is="Component" />
    <transition v-else name="page" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition:
    opacity var(--nono-dur-base, 240ms) var(--nono-ease-standard),
    transform var(--nono-dur-base, 240ms) var(--nono-ease-standard);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
}
</style>
