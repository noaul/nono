<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Bell, CheckCheck } from 'lucide-vue-next';
import { apiRequest, jsonBody } from '@/api/client';
import type { AdminNotification, AdminNotificationFeed } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const open = ref(false);
const isLoading = ref(false);
const feed = ref<AdminNotificationFeed>({ items: [], unreadCount: 0, generatedAt: '' });
const root = ref<HTMLElement | null>(null);
const badgeLabel = computed(() => feed.value.unreadCount > 99 ? '99+' : String(feed.value.unreadCount));

async function load() {
  if (isLoading.value) return;
  isLoading.value = true;
  try {
    feed.value = await apiRequest<AdminNotificationFeed>('/api/admin/notifications?limit=5');
  } catch {
    feed.value = { items: [], unreadCount: 0, generatedAt: '' };
  } finally {
    isLoading.value = false;
  }
}

function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && event.target instanceof Node && !root.value.contains(event.target)) open.value = false;
}

function openPanel() {
  open.value = !open.value;
  if (open.value) void load();
}

function isAdminRoute(item: AdminNotification) {
  return item.href.startsWith('/admin');
}

function markRead(item: AdminNotification) {
  if (item.read) return;
  item.read = true;
  feed.value.unreadCount = Math.max(0, feed.value.unreadCount - 1);
  void apiRequest(`/api/admin/notifications/${encodeURIComponent(item.key)}/read`, {
    method: 'PUT',
    body: jsonBody({ read: true }),
  }).catch(() => undefined);
}

onMounted(() => {
  void load();
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('nono:notifications-changed', load);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('nono:notifications-changed', load);
});
</script>

<template>
  <div ref="root" class="notification-bell">
    <button
      class="notification-bell-button"
      type="button"
      :aria-label="t('ui.notifications')"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="openPanel"
    >
      <Bell :size="18" />
      <span v-if="feed.unreadCount" class="notification-badge">{{ badgeLabel }}</span>
    </button>

    <section v-if="open" class="notification-popover" :aria-label="t('ui.recentNotifications')">
      <header>
        <strong>{{ t('ui.notifications') }}</strong>
        <span v-if="feed.unreadCount">{{ t('ui.unread', { count: feed.unreadCount }) }}</span>
      </header>
      <div v-if="isLoading && !feed.items.length" class="notification-popover-empty">{{ t('ui.reading') }}</div>
      <div v-else-if="!feed.items.length" class="notification-popover-empty">{{ t('ui.noNotifications') }}</div>
      <div v-else class="notification-preview-list">
        <template v-for="item in feed.items" :key="item.key">
          <RouterLink
            v-if="isAdminRoute(item)"
            class="notification-preview-item"
            :class="{ 'is-unread': !item.read }"
            :to="item.href"
            @click="markRead(item); open = false"
          >
            <i :class="`severity-${item.severity}`" aria-hidden="true"></i>
            <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
          </RouterLink>
          <a
            v-else
            class="notification-preview-item"
            :class="{ 'is-unread': !item.read }"
            :href="item.href"
            target="_blank"
            rel="noreferrer"
            @click="markRead(item); open = false"
          >
            <i :class="`severity-${item.severity}`" aria-hidden="true"></i>
            <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
          </a>
        </template>
      </div>
      <RouterLink class="notification-popover-footer" to="/admin/notifications" @click="open = false">
        <CheckCheck :size="15" /> {{ t('ui.viewAll') }}
      </RouterLink>
    </section>
  </div>
</template>

<style scoped>
.notification-bell { position: relative; }

.notification-bell-button {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: var(--admin-text);
  cursor: pointer;
  display: inline-flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  position: relative;
  width: 32px;
}

.notification-bell-button:hover,
.notification-bell-button:focus-visible { background: var(--admin-surface-sunken); color: var(--admin-text); outline: none; }

.notification-badge {
  align-items: center;
  background: var(--admin-danger);
  border: 2px solid var(--admin-border);
  border-radius: 999px;
  color: var(--admin-surface-elevated);
  display: inline-flex;
  font-size: 9px;
  font-weight: 700;
  height: 17px;
  justify-content: center;
  min-width: 17px;
  padding: 0 3px;
  position: absolute;
  right: -4px;
  top: -4px;
}

.notification-popover {
  background: var(--admin-surface-elevated);
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 12%);
  overflow: hidden;
  position: absolute;
  right: 0;
  top: calc(100% + 9px);
  width: min(360px, calc(100vw - 24px));
  z-index: 90;
}

.notification-popover header {
  align-items: center;
  border-bottom: 1px solid var(--admin-border);
  display: flex;
  justify-content: space-between;
  min-height: 46px;
  padding: 0 14px;
}

.notification-popover header strong { color: var(--admin-text); font-size: 14px; }
.notification-popover header span { color: var(--admin-text-muted); font-size: 12px; }
.notification-preview-list { max-height: 330px; overflow-y: auto; padding: 5px; }

.notification-preview-item {
  align-items: flex-start;
  border-radius: 6px;
  color: var(--admin-text);
  display: grid;
  gap: 10px;
  grid-template-columns: 8px minmax(0, 1fr);
  padding: 10px;
  text-decoration: none;
}

.notification-preview-item:hover { background: var(--admin-surface-sunken); }
.notification-preview-item > i { border-radius: 50%; height: 7px; margin-top: 5px; width: 7px; }
.notification-preview-item > i.severity-critical { background: var(--admin-status-danger-dot); }
.notification-preview-item > i.severity-warning { background: var(--admin-status-warn-dot); }
.notification-preview-item > i.severity-info { background: var(--admin-status-ok-dot); }
.notification-preview-item > span { display: grid; gap: 3px; min-width: 0; }
.notification-preview-item strong { font-size: 13px; font-weight: 500; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notification-preview-item.is-unread strong { font-weight: 650; }
.notification-preview-item small { color: var(--admin-text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notification-popover-empty { color: var(--admin-text-muted); font-size: 13px; padding: 34px 14px; text-align: center; }

.notification-popover-footer {
  align-items: center;
  border-top: 1px solid var(--admin-border);
  color: var(--admin-text);
  display: flex;
  font-size: 12px;
  font-weight: 500;
  gap: 7px;
  justify-content: center;
  min-height: 40px;
  text-decoration: none;
}

.notification-popover-footer:hover { background: var(--admin-surface-sunken); }
</style>
