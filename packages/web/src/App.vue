<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import ColorModeControl from '@/components/ColorModeControl.vue';

const route = useRoute();
const adminPaths = ['/admin', '/login', '/register', '/setup'];
const isAdminRoute = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'));
const showStandaloneModeControl = computed(() => ['/login', '/register', '/setup', '/privacy'].includes(route.path));

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
  <ColorModeControl v-if="showStandaloneModeControl" class="standalone-color-mode" />
  <router-view v-slot="{ Component }">
    <component v-if="isAdminRoute" :is="Component" />
    <transition v-else name="page" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style>
.standalone-color-mode {
  --color-mode-border: var(--line);
  --color-mode-hover: var(--panel-2);
  --color-mode-popover: var(--panel);
  --color-mode-surface: var(--panel);
  --color-mode-text: var(--text);
  position: fixed;
  right: 20px;
  top: 20px;
  z-index: 100;
}

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
