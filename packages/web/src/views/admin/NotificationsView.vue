<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue';
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  DatabaseBackup,
  ExternalLink,
  Github,
  ShieldOff,
  Trash2,
  WalletCards,
  X,
} from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { AdminNotification, AdminNotificationFeed, AdminNotificationSource } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';
import type { MessageKey } from '@/locales';

const { t } = useI18n();

const confirmApi = useConfirm();
const feed = ref<AdminNotificationFeed>({ items: [], unreadCount: 0, generatedAt: '' });
const isLoading = ref(true);
const isMarkingAll = ref(false);
const activeFilter = ref<'all' | 'unread'>('all');
const activeSource = ref<'all' | AdminNotificationSource>('all');
const error = ref('');
const workingActions = ref(new Set<string>());

const sourceMeta = {
  links: { labelKey: 'notifications.sourceLinks', icon: Activity },
  nodesk: { labelKey: 'notifications.sourceNodesk', icon: CalendarDays },
  nomoney: { labelKey: 'notifications.sourceNomoney', icon: WalletCards },
  nostar: { labelKey: 'notifications.sourceNostar', icon: Github },
  backup: { labelKey: 'notifications.sourceBackup', icon: DatabaseBackup },
} satisfies Record<AdminNotificationSource, { labelKey: MessageKey; icon: Component }>;

const sourceOptions = computed(() => {
  const counts = new Map<AdminNotificationSource, number>();
  feed.value.items.forEach((item) => counts.set(item.source, (counts.get(item.source) || 0) + 1));
  return (Object.keys(sourceMeta) as AdminNotificationSource[])
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
    error.value = event instanceof Error ? event.message : t('notifications.loadFailed');
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
    error.value = event instanceof Error ? event.message : t('notifications.updateFailed');
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
    error.value = event instanceof Error ? event.message : t('notifications.markAllFailed');
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
    error.value = event instanceof Error ? event.message : t('notifications.dismissFailed');
  }
}

async function disableBookmarkHealth(item: AdminNotification) {
  if (!item.entityId || isWorking(item, 'disable')) return;
  setWorking(item, 'disable', true);
  error.value = '';
  try {
    await apiRequest(`/api/admin/links/${item.entityId}`, {
      method: 'PUT',
      body: jsonBody({ healthCheckEnabled: false }),
    });
    removeItem(item);
    notifySuccess(t('notifications.stopped'));
    announceChange();
  } catch (event) {
    const message = event instanceof Error ? event.message : t('notifications.stopFailed');
    error.value = message;
    notifyError(message);
  } finally {
    setWorking(item, 'disable', false);
  }
}

async function deleteBookmark(item: AdminNotification) {
  if (!item.entityId || isWorking(item, 'delete')) return;
  const confirmed = await confirmApi.confirm({
    title: t('notifications.deleteBookmark'),
    message: t('notifications.deleteConfirm', { name: item.entityLabel || item.title }),
    confirmText: t('common.delete'),
    tone: 'danger',
  });
  if (!confirmed) return;
  setWorking(item, 'delete', true);
  error.value = '';
  try {
    await apiRequest(`/api/admin/links/${item.entityId}`, { method: 'DELETE' });
    removeItem(item);
    notifySuccess(t('notifications.trashed'));
    announceChange();
  } catch (event) {
    const message = event instanceof Error ? event.message : t('notifications.deleteFailed');
    error.value = message;
    notifyError(message);
  } finally {
    setWorking(item, 'delete', false);
  }
}

function removeItem(item: AdminNotification) {
  const index = feed.value.items.findIndex((entry) => entry.key === item.key);
  if (index >= 0) feed.value.items.splice(index, 1);
  recalculateUnread();
}

function actionKey(item: AdminNotification, action: string) {
  return `${item.key}:${action}`;
}

function isWorking(item: AdminNotification, action: string) {
  return workingActions.value.has(actionKey(item, action));
}

function setWorking(item: AdminNotification, action: string, working: boolean) {
  const next = new Set(workingActions.value);
  if (working) next.add(actionKey(item, action));
  else next.delete(actionKey(item, action));
  workingActions.value = next;
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
    <AdminPageHeader :eyebrow="t('admin.sectionSystem')" :title="t('admin.titleNotifications')">
      <template #actions>
        <button
          class="button secondary"
          data-testid="mark-all-notifications-read"
          type="button"
          :disabled="isMarkingAll || !feed.unreadCount"
          @click="markAllRead"
        >
          <CheckCheck :size="16" /> {{ isMarkingAll ? t('notifications.markingAll') : t('notifications.markAllRead') }}
        </button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="notification-center" :aria-label="t('notifications.center')">
      <header class="notification-toolbar">
        <div class="notification-filters" :aria-label="t('notifications.statusFilter')">
          <button type="button" :class="{ active: activeFilter === 'all' }" :aria-pressed="activeFilter === 'all'" @click="activeFilter = 'all'">
            {{ t('notifications.all') }} <span>{{ feed.items.length }}</span>
          </button>
          <button data-testid="notification-filter-unread" type="button" :class="{ active: activeFilter === 'unread' }" :aria-pressed="activeFilter === 'unread'" @click="activeFilter = 'unread'">
            {{ t('notifications.unread') }} <span data-testid="notification-unread-count">{{ feed.unreadCount }}</span>
          </button>
        </div>
        <div class="notification-sources" :aria-label="t('notifications.sourceFilter')">
          <button type="button" :class="{ active: activeSource === 'all' }" @click="activeSource = 'all'">{{ t('notifications.allSources') }}</button>
          <button
            v-for="option in sourceOptions"
            :key="option.source"
            type="button"
            class="source-filter"
            :class="[`source-${option.source}`, { active: activeSource === option.source }]"
            :data-testid="`notification-source-${option.source}`"
            @click="activeSource = option.source"
          >
            {{ t(option.labelKey) }} {{ option.count }}
          </button>
        </div>
      </header>

      <div v-if="isLoading" class="notification-empty">{{ t('notifications.loading') }}</div>
      <div v-else-if="!visibleItems.length" class="notification-empty">
        <Bell :size="22" />
        <strong>{{ feed.items.length ? t('notifications.noneInFilter') : t('notifications.none') }}</strong>
      </div>
      <div v-else class="notification-list">
        <article
          v-for="item in visibleItems"
          :key="item.key"
          class="notification-row"
          :class="[{ 'is-unread': !item.read }, `severity-${item.severity}`, `source-${item.source}`]"
        >
          <span class="notification-source-icon" :title="t(sourceMeta[item.source].labelKey)">
            <component :is="sourceMeta[item.source].icon" :size="18" />
          </span>
          <div class="notification-copy">
            <RouterLink v-if="isAdminRoute(item)" :to="item.href" @click="markRead(item)">{{ item.title }}</RouterLink>
            <a v-else :href="item.href" target="_blank" rel="noreferrer" @click="markRead(item)">{{ item.title }}</a>
            <p>{{ item.description }}</p>
            <small>{{ t(sourceMeta[item.source].labelKey) }} · {{ formatTime(item) }}</small>
          </div>
          <span class="notification-severity" :title="item.severity"></span>
          <div class="notification-actions">
            <a
              v-if="item.source === 'links' && item.entityId && item.targetUrl"
              class="icon-button secondary"
              :data-testid="`open-bookmark-${item.entityId}`"
              :href="item.targetUrl"
              target="_blank"
              rel="noopener noreferrer"
              :title="t('notifications.openSite')"
              :aria-label="t('notifications.openSite')"
              @click="markRead(item)"
            ><ExternalLink :size="15" /></a>
            <button
              v-if="item.source === 'links' && item.entityId"
              class="icon-button secondary"
              :data-testid="`disable-bookmark-health-${item.entityId}`"
              type="button"
              :title="t('notifications.stopChecking')"
              :aria-label="t('notifications.stopChecking')"
              :disabled="isWorking(item, 'disable')"
              @click="disableBookmarkHealth(item)"
            ><ShieldOff :size="15" /></button>
            <button
              v-if="item.source === 'links' && item.entityId"
              class="icon-button secondary danger-action"
              :data-testid="`delete-bookmark-${item.entityId}`"
              type="button"
              :title="t('notifications.deleteBookmark')"
              :aria-label="t('notifications.deleteBookmark')"
              :disabled="isWorking(item, 'delete')"
              @click="deleteBookmark(item)"
            ><Trash2 :size="15" /></button>
            <button
              class="icon-button secondary"
              type="button"
              :title="item.read ? t('notifications.markUnread') : t('notifications.markRead')"
              :aria-label="item.read ? t('notifications.markUnread') : t('notifications.markRead')"
              @click="markRead(item, !item.read)"
            ><Check :size="15" /></button>
            <button
              class="icon-button secondary"
              :data-testid="`dismiss-notification-${item.key}`"
              type="button"
              :title="t('notifications.dismiss')"
              :aria-label="t('notifications.dismiss')"
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
  background: var(--admin-surface-elevated);
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  min-width: 0;
  overflow: hidden;
}

.notification-toolbar {
  align-items: center;
  background: var(--admin-surface-elevated);
  border-bottom: 1px solid var(--admin-border);
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
  color: var(--admin-text-muted);
  cursor: pointer;
  flex: 0 0 auto;
  font-size: 12px;
  min-height: 32px;
  padding: 6px 9px;
}

.notification-filters button:hover,
.notification-sources button:hover { background: var(--admin-surface-sunken); color: var(--admin-text); }
.notification-filters button.active,
.notification-sources button.active { background: var(--admin-surface-sunken); color: var(--admin-text); font-weight: 600; }
.notification-sources .source-filter { --source-color: var(--admin-text-muted); }
.notification-sources .source-filter.active { background: var(--source-soft); color: var(--source-color); }
.notification-filters button span { margin-left: 3px; }
.notification-list { background: var(--admin-surface-elevated); }

.notification-row {
  --source-color: var(--admin-text-muted);
  --source-soft: var(--admin-surface-sunken);
  align-items: center;
  border-left: 3px solid var(--source-color);
  display: grid;
  gap: 12px;
  grid-template-columns: 38px minmax(0, 1fr) 8px auto;
  min-height: 82px;
  padding: 12px 14px;
}

.notification-row + .notification-row { border-top: 1px solid var(--admin-border); }
.notification-row:hover { background: color-mix(in srgb, var(--source-soft) 50%, var(--admin-surface-elevated)); }
.notification-row.is-unread { background: color-mix(in srgb, var(--source-soft) 68%, var(--admin-surface-elevated)); }
.notification-row.is-unread:hover { background: color-mix(in srgb, var(--source-soft) 82%, var(--admin-surface-elevated)); }

.source-links { --source-color: var(--admin-status-danger); --source-soft: color-mix(in srgb, var(--admin-status-danger) 16%, transparent); }
.source-nodesk { --source-color: var(--admin-link); --source-soft: color-mix(in srgb, var(--admin-link) 16%, transparent); }
.source-nomoney { --source-color: var(--admin-status-ok); --source-soft: color-mix(in srgb, var(--admin-status-ok) 16%, transparent); }
.source-nostar { --source-color: var(--admin-status-alt); --source-soft: color-mix(in srgb, var(--admin-status-alt) 16%, transparent); }
.source-backup { --source-color: var(--admin-status-warn); --source-soft: color-mix(in srgb, var(--admin-status-warn) 16%, transparent); }

.notification-source-icon {
  align-items: center;
  background: var(--source-soft);
  border-radius: 7px;
  color: var(--source-color);
  display: inline-flex;
  height: 36px;
  justify-content: center;
  width: 36px;
}

.notification-copy { display: grid; gap: 4px; min-width: 0; }
.notification-copy a { color: var(--admin-text); font-size: 14px; font-weight: 500; line-height: 1.35; text-decoration: none; }
.notification-row.is-unread .notification-copy a { font-weight: 650; }
.notification-copy a:hover { text-decoration: underline; }
.notification-copy p { color: var(--admin-text-muted); font-size: 12px; line-height: 1.45; margin: 0; overflow-wrap: anywhere; }
.notification-copy small { color: var(--admin-text-muted); font-size: 11px; }

.notification-severity { border-radius: 50%; height: 7px; width: 7px; }
.severity-critical .notification-severity { background: var(--admin-status-danger-dot); }
.severity-warning .notification-severity { background: var(--admin-status-warn-dot); }
.severity-info .notification-severity { background: var(--admin-status-ok-dot); }
.notification-actions { display: flex; gap: 5px; }
.notification-actions .icon-button { height: 30px; min-height: 30px; width: 30px; }
.notification-actions a.icon-button { align-items: center; display: inline-flex; justify-content: center; }
.notification-actions .danger-action:hover { border-color: var(--admin-danger); color: var(--admin-danger); }

.notification-empty {
  align-items: center;
  color: var(--admin-text-muted);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 8px;
  justify-content: center;
  min-height: 220px;
}

.notification-empty strong { color: var(--admin-text); font-size: 13px; font-weight: 500; }


@media (max-width: 720px) {
  .notification-toolbar { align-items: stretch; flex-direction: column; }
  .notification-sources { justify-content: flex-start; }
  .notification-row { align-items: start; grid-template-columns: 36px minmax(0, 1fr) auto; padding: 12px; }
  .notification-severity { grid-column: 3; grid-row: 1; margin-top: 5px; }
  .notification-actions { flex-wrap: wrap; grid-column: 2 / 4; justify-content: flex-end; }
}
</style>
