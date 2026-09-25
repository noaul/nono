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
  <!-- A wrapper owns the fixed position: on the component root it lost to the control's own
       scoped `position: relative`, which slid the button half off the left edge. -->
  <div v-if="showStandaloneModeControl" class="standalone-color-mode">
    <ColorModeControl />
  </div>
  <router-view v-slot="{ Component }">
    <component v-if="isAdminRoute" :is="Component" />
    <transition v-else name="page" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style>
.standalone-color-mode {
  --color-mode-border: var(--ui-border);
  --color-mode-hover: var(--ui-surface-sunken);
  --color-mode-popover: var(--ui-surface-raised);
  --color-mode-popover-text: var(--ui-text);
  --color-mode-popover-hover: var(--ui-surface-sunken);
  --color-mode-surface: var(--ui-surface);
  --color-mode-text: var(--ui-text);
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
