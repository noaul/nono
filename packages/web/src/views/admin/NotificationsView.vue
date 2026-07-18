<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  DatabaseBackup,
  Github,
  WalletCards,
  X,
} from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { AdminNotification, AdminNotificationFeed, AdminNotificationSource } from '@/api/types';

const feed = ref<AdminNotificationFeed>({ items: [], unreadCount: 0, generatedAt: '' });
const isLoading = ref(true);
const isMarkingAll = ref(false);
const activeFilter = ref<'all' | 'unread'>('all');
const activeSource = ref<'all' | AdminNotificationSource>('all');
const error = ref('');

const sourceMeta = {
  links: { label: '书签', icon: Activity },
  nodesk: { label: 'Nodesk', icon: CalendarDays },
  nomoney: { label: 'NoMoney', icon: WalletCards },
  nostar: { label: 'NoStar', icon: Github },
  backup: { label: '备份', icon: DatabaseBackup },
} as const;

const sourceOptions = computed(() => {
  const counts = new Map<AdminNotificationSource, number>();
  feed.value.items.forEach((item) => counts.set(item.source, (counts.get(item.source) || 0) + 1));
  return (Object.keys(sourceMeta) as AdminNotificationSource[])
    .filter((source) => counts.has(source))
    .map((source) => ({ source, count: counts.get(source) || 0, ...sourceMeta[source] }));
});

const visibleItems = computed(() => feed.value.items.filter((item) => (
  (activeFilter.value === 'all' || !item.read)
  && (activeSource.value === 'all' || item.source === activeSource.value)
)));

async function load() {
  isLoading.value = true;
  error.value = '';
  try {
    feed.value = await apiRequest<AdminNotificationFeed>('/api/admin/notifications?limit=100');
  } catch (event) {
    error.value = event instanceof Error ? event.message : '通知加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function markRead(item: AdminNotification, read = true) {
  const previous = item.read;
  item.read = read;
  recalculateUnread();
  try {
    await apiRequest(`/api/admin/notifications/${encodeURIComponent(item.key)}/read`, {
      method: 'PUT',
      body: jsonBody({ read }),
    });
    announceChange();
  } catch (event) {
    item.read = previous;
    recalculateUnread();
    error.value = event instanceof Error ? event.message : '通知状态更新失败';
  }
}

async function markAllRead() {
  if (isMarkingAll.value || !feed.value.unreadCount) return;
  isMarkingAll.value = true;
  error.value = '';
  try {
    await apiRequest('/api/admin/notifications/mark-all-read', { method: 'POST' });
    feed.value.items.forEach((item) => { item.read = true; });
    feed.value.unreadCount = 0;
    announceChange();
  } catch (event) {
    error.value = event instanceof Error ? event.message : '全部标记已读失败';
  } finally {
    isMarkingAll.value = false;
  }
}

async function dismiss(item: AdminNotification) {
  const index = feed.value.items.findIndex((entry) => entry.key === item.key);
  if (index < 0) return;
  feed.value.items.splice(index, 1);
  recalculateUnread();
  try {
    await apiRequest(`/api/admin/notifications/${encodeURIComponent(item.key)}`, { method: 'DELETE' });
    announceChange();
  } catch (event) {
    feed.value.items.splice(index, 0, item);
    recalculateUnread();
    error.value = event instanceof Error ? event.message : '忽略通知失败';
  }
}

function recalculateUnread() {
  feed.value.unreadCount = feed.value.items.filter((item) => !item.read).length;
}

function announceChange() {
  window.dispatchEvent(new CustomEvent('nono:notifications-changed'));
}

function isAdminRoute(item: AdminNotification) {
  return item.href.startsWith('/admin');
}

function formatTime(item: AdminNotification) {
  const value = item.dueAt || item.occurredAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack notifications-page">
    <AdminPageHeader eyebrow="系统" title="通知中心">
      <template #actions>
        <button
          class="button secondary"
          data-testid="mark-all-notifications-read"
          type="button"
          :disabled="isMarkingAll || !feed.unreadCount"
          @click="markAllRead"
        >
          <CheckCheck :size="16" /> {{ isMarkingAll ? '处理中' : '全部已读' }}
        </button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="notification-center" aria-label="统一通知中心">
      <header class="notification-toolbar">
        <div class="notification-filters" aria-label="通知状态">
          <button type="button" :class="{ active: activeFilter === 'all' }" :aria-pressed="activeFilter === 'all'" @click="activeFilter = 'all'">
            全部 <span>{{ feed.items.length }}</span>
          </button>
          <button data-testid="notification-filter-unread" type="button" :class="{ active: activeFilter === 'unread' }" :aria-pressed="activeFilter === 'unread'" @click="activeFilter = 'unread'">
            未读 <span data-testid="notification-unread-count">{{ feed.unreadCount }}</span>
          </button>
        </div>
        <div v-if="sourceOptions.length > 1" class="notification-sources" aria-label="通知来源">
          <button type="button" :class="{ active: activeSource === 'all' }" @click="activeSource = 'all'">全部来源</button>
          <button v-for="option in sourceOptions" :key="option.source" type="button" :class="{ active: activeSource === option.source }" @click="activeSource = option.source">
            {{ option.label }} {{ option.count }}
          </button>
        </div>
      </header>

      <div v-if="isLoading" class="notification-empty">正在读取通知</div>
      <div v-else-if="!visibleItems.length" class="notification-empty">
        <Bell :size="22" />
        <strong>{{ feed.items.length ? '当前筛选下没有通知' : '暂无通知' }}</strong>
      </div>
      <div v-else class="notification-list">
        <article
          v-for="item in visibleItems"
          :key="item.key"
          class="notification-row"
          :class="[{ 'is-unread': !item.read }, `severity-${item.severity}`]"
        >
          <span class="notification-source-icon" :title="sourceMeta[item.source].label">
            <component :is="sourceMeta[item.source].icon" :size="18" />
          </span>
          <div class="notification-copy">
            <RouterLink v-if="isAdminRoute(item)" :to="item.href" @click="markRead(item)">{{ item.title }}</RouterLink>
            <a v-else :href="item.href" target="_blank" rel="noreferrer" @click="markRead(item)">{{ item.title }}</a>
            <p>{{ item.description }}</p>
            <small>{{ sourceMeta[item.source].label }} · {{ formatTime(item) }}</small>
          </div>
          <span class="notification-severity" :title="item.severity"></span>
          <div class="notification-actions">
            <button
              class="icon-button secondary"
              type="button"
              :title="item.read ? '标记未读' : '标记已读'"
              :aria-label="item.read ? '标记未读' : '标记已读'"
              @click="markRead(item, !item.read)"
            ><Check :size="15" /></button>
            <button
              class="icon-button secondary"
              :data-testid="`dismiss-notification-${item.key}`"
              type="button"
              title="忽略"
              aria-label="忽略"
              @click="dismiss(item)"
            ><X :size="15" /></button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.notification-center {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  min-width: 0;
  overflow: hidden;
}

.notification-toolbar {
  align-items: center;
  background: #ffffff;
  border-bottom: 1px solid #eaeaea;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  min-height: 54px;
  padding: 8px 12px;
}

.notification-filters,
.notification-sources { align-items: center; display: flex; gap: 4px; min-width: 0; }
.notification-sources { justify-content: flex-end; overflow-x: auto; }

.notification-filters button,
.notification-sources button {
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: #6b6b6b;
  cursor: pointer;
  flex: 0 0 auto;
  font-size: 12px;
  min-height: 32px;
  padding: 6px 9px;
}

.notification-filters button:hover,
.notification-sources button:hover { background: #f4f4f4; color: #262626; }
.notification-filters button.active,
.notification-sources button.active { background: #ececec; color: #0d0d0d; font-weight: 600; }
.notification-filters button span { margin-left: 3px; }
.notification-list { background: #ffffff; }

.notification-row {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 38px minmax(0, 1fr) 8px auto;
  min-height: 82px;
  padding: 12px 14px;
}

.notification-row + .notification-row { border-top: 1px solid #eeeeee; }
.notification-row:hover { background: #fafafa; }
.notification-row.is-unread { background: #f7f7f7; }
.notification-row.is-unread:hover { background: #f2f2f2; }

.notification-source-icon {
  align-items: center;
  background: #f1f1f1;
  border-radius: 7px;
  color: #404040;
  display: inline-flex;
  height: 36px;
  justify-content: center;
  width: 36px;
}

.notification-copy { display: grid; gap: 4px; min-width: 0; }
.notification-copy a { color: #0d0d0d; font-size: 14px; font-weight: 500; line-height: 1.35; text-decoration: none; }
.notification-row.is-unread .notification-copy a { font-weight: 650; }
.notification-copy a:hover { text-decoration: underline; }
.notification-copy p { color: #595959; font-size: 12px; line-height: 1.45; margin: 0; overflow-wrap: anywhere; }
.notification-copy small { color: #8a8a8a; font-size: 11px; }

.notification-severity { border-radius: 50%; height: 7px; width: 7px; }
.severity-critical .notification-severity { background: #d92d20; }
.severity-warning .notification-severity { background: #d97706; }
.severity-info .notification-severity { background: #10a37f; }
.notification-actions { display: flex; gap: 5px; }
.notification-actions .icon-button { height: 30px; min-height: 30px; width: 30px; }

.notification-empty {
  align-items: center;
  color: #737373;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 8px;
  justify-content: center;
  min-height: 220px;
}

.notification-empty strong { color: #404040; font-size: 13px; font-weight: 500; }

@media (max-width: 720px) {
  .notification-toolbar { align-items: stretch; flex-direction: column; }
  .notification-sources { justify-content: flex-start; }
  .notification-row { align-items: start; grid-template-columns: 36px minmax(0, 1fr) auto; padding: 12px; }
  .notification-severity { grid-column: 3; grid-row: 1; margin-top: 5px; }
  .notification-actions { grid-column: 2 / 4; justify-content: flex-end; }
}
</style>
