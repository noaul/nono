<script setup lang="ts">
import { CalendarDays, WalletCards } from 'lucide-vue-next';
import type { AdminNotification } from '@/api/types';

defineProps<{
  items: AdminNotification[];
  overflow: number;
}>();

defineEmits<{
  select: [item: AdminNotification];
}>();
</script>

<template>
  <Transition name="home-urgent">
    <section v-if="items.length" class="home-urgent-bar" aria-label="近期提醒">
      <RouterLink
        v-for="item in items"
        :key="item.key"
        class="home-urgent-item"
        :class="`severity-${item.severity}`"
        :to="item.href"
        @click="$emit('select', item)"
      >
        <span class="home-urgent-icon" aria-hidden="true">
          <CalendarDays v-if="item.source === 'nodesk'" :size="17" />
          <WalletCards v-else :size="17" />
        </span>
        <span class="home-urgent-copy">
          <small>{{ item.source === 'nodesk' ? '今日日程' : '续费提醒' }}</small>
          <strong>{{ item.title }}</strong>
        </span>
      </RouterLink>
      <RouterLink v-if="overflow" class="home-urgent-more" to="/admin/notifications">
        还有 {{ overflow }} 条
      </RouterLink>
    </section>
  </Transition>
</template>

<style scoped>
.home-urgent-bar {
  align-items: stretch;
  backdrop-filter: blur(var(--public-search-blur, 20px));
  -webkit-backdrop-filter: blur(var(--public-search-blur, 20px));
  background: var(--public-notification-surface, rgba(8, 12, 18, 0.92));
  border: 1px solid rgba(var(--public-notification-border-rgb, 255, 255, 255), 0.18);
  border-radius: var(--public-card-radius, 8px);
  box-shadow: 0 10px 30px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.14), inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), 0.2);
  display: flex;
  gap: 5px;
  justify-self: center;
  margin-top: -16px;
  max-width: 1200px;
  min-width: 0;
  padding: 5px;
  width: 100%;
}

.home-urgent-item {
  align-items: center;
  border-radius: 7px;
  color: var(--public-notification-text, #f3f4f6);
  display: flex;
  flex: 1 1 0;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  text-decoration: none;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.home-urgent-item:hover,
.home-urgent-item:focus-visible {
  background: rgba(var(--public-notification-hover-rgb, 255, 255, 255), 0.1);
  outline: none;
  transform: translateY(-1px);
}

.home-urgent-icon {
  align-items: center;
  background: rgba(var(--accent-rgb), 0.24);
  border: 1px solid rgba(var(--accent-bright-rgb), 0.32);
  border-radius: 7px;
  color: var(--accent-bright, #34d399);
  display: inline-flex;
  flex: 0 0 auto;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.severity-critical .home-urgent-icon {
  background: rgba(225, 29, 72, 0.16);
  border-color: rgba(251, 113, 133, 0.34);
  color: #fb7185;
}

.severity-warning .home-urgent-icon {
  background: rgba(217, 119, 6, 0.16);
  border-color: rgba(251, 191, 36, 0.34);
  color: #fbbf24;
}

.home-urgent-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.home-urgent-copy small {
  color: rgba(var(--public-notification-text-rgb, 243, 244, 246), 0.62);
  font-size: 10px;
  font-weight: 700;
}

.home-urgent-copy strong {
  font-size: 12px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-urgent-more {
  align-items: center;
  color: rgba(var(--public-notification-text-rgb, 243, 244, 246), 0.74);
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  padding: 0 10px;
  text-decoration: none;
}

.home-urgent-more:hover { color: var(--public-notification-text, #f3f4f6); }

.home-urgent-enter-active,
.home-urgent-leave-active { transition: opacity 0.25s ease, transform 0.3s ease; }
.home-urgent-enter-from,
.home-urgent-leave-to { opacity: 0; transform: translateY(-8px); }

@media (max-width: 720px) {
  .home-urgent-bar {
    align-items: stretch;
    flex-direction: column;
    margin-top: -8px;
  }

  .home-urgent-item + .home-urgent-item {
    border-top: 1px solid rgba(var(--public-notification-border-rgb, 255, 255, 255), 0.14);
  }

  .home-urgent-more { justify-content: center; min-height: 30px; }
}

@media (prefers-reduced-motion: reduce) {
  .home-urgent-enter-active,
  .home-urgent-leave-active,
  .home-urgent-item { transition: none; }
}
</style>
