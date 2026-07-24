import { computed, onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { AdminNotification, AdminNotificationFeed } from '@/api/types';

const HOME_NOTIFICATION_SOURCES = new Set(['nodesk', 'nomoney']);
const HOME_NOTIFICATION_SOURCE_QUERY = encodeURIComponent('nodesk,nomoney');
const HOME_NOTIFICATION_FEED_URL = `/api/admin/notifications?limit=100&sources=${HOME_NOTIFICATION_SOURCE_QUERY}`;
const HOME_NOTIFICATION_MARK_ALL_URL = `/api/admin/notifications/mark-all-read?sources=${HOME_NOTIFICATION_SOURCE_QUERY}`;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useHomeNotifications(enabled: MaybeRefOrGetter<boolean>) {
  const items = ref<AdminNotification[]>([]);
  const loading = ref(false);
  const error = ref('');
  const feedUnreadCount = ref(0);
  const feedUrgentUnreadCount = ref(0);
  let mounted = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let requestVersion = 0;
  let activeMutations = 0;
  let reloadAfterMutations = false;

  const unreadCount = computed(() => feedUnreadCount.value);
  const urgentCandidates = computed(() => items.value.filter((item) => (
    !item.read && (item.severity === 'critical' || item.severity === 'warning')
  )));
  const urgentItems = computed(() => urgentCandidates.value.slice(0, 2));
  const urgentOverflow = computed(() => Math.max(0, feedUrgentUnreadCount.value - urgentItems.value.length));

  async function load() {
    if (!mounted || !toValue(enabled) || loading.value || activeMutations) return;
    const version = ++requestVersion;
    loading.value = true;
    error.value = '';
    try {
      const feed = await apiRequest<AdminNotificationFeed>(HOME_NOTIFICATION_FEED_URL);
      if (version !== requestVersion || !toValue(enabled)) return;
      items.value = feed.items.filter((item) => HOME_NOTIFICATION_SOURCES.has(item.source));
      feedUnreadCount.value = feed.unreadCount;
      feedUrgentUnreadCount.value = feed.urgentUnreadCount
        ?? items.value.filter((item) => !item.read && item.severity !== 'info').length;
    } catch (event) {
      if (version === requestVersion) error.value = event instanceof Error ? event.message : '通知加载失败';
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  }

  async function markRead(item: AdminNotification, read = true) {
    const current = items.value.find((entry) => entry.key === item.key);
    if (!current || current.read === read) return;
    const previous = current.read;
    beginMutation();
    updateReadState(current, read);
    let shouldReload = false;
    try {
      await apiRequest(`/api/admin/notifications/${encodeURIComponent(item.key)}/read`, {
        method: 'PUT',
        body: jsonBody({ read }),
      });
      announceChange();
    } catch {
      updateReadState(current, previous);
      shouldReload = true;
    } finally {
      await finishMutation(shouldReload);
    }
  }

  async function dismiss(item: AdminNotification) {
    const index = items.value.findIndex((entry) => entry.key === item.key);
    if (index < 0) return;
    beginMutation();
    const [removed] = items.value.splice(index, 1);
    adjustUnreadCounts(removed, -1);
    let shouldReload = false;
    try {
      await apiRequest(`/api/admin/notifications/${encodeURIComponent(item.key)}`, { method: 'DELETE' });
      announceChange();
    } catch {
      items.value.splice(index, 0, removed);
      adjustUnreadCounts(removed, 1);
      shouldReload = true;
    } finally {
      await finishMutation(shouldReload);
    }
  }

  async function markAllRead() {
    if (!unreadCount.value) return;
    const previous = items.value.map((item) => item.read);
    const previousUnreadCount = feedUnreadCount.value;
    const previousUrgentUnreadCount = feedUrgentUnreadCount.value;
    beginMutation();
    items.value.forEach((item) => { item.read = true; });
    feedUnreadCount.value = 0;
    feedUrgentUnreadCount.value = 0;
    let shouldReload = false;
    try {
      await apiRequest(HOME_NOTIFICATION_MARK_ALL_URL, { method: 'POST' });
      announceChange();
    } catch {
      items.value.forEach((item, index) => { item.read = previous[index]; });
      feedUnreadCount.value = previousUnreadCount;
      feedUrgentUnreadCount.value = previousUrgentUnreadCount;
      shouldReload = true;
    } finally {
      await finishMutation(shouldReload);
    }
  }

  function updateReadState(item: AdminNotification, read: boolean) {
    if (item.read === read) return;
    const direction = read ? -1 : 1;
    feedUnreadCount.value = Math.max(0, feedUnreadCount.value + direction);
    if (item.severity !== 'info') {
      feedUrgentUnreadCount.value = Math.max(0, feedUrgentUnreadCount.value + direction);
    }
    item.read = read;
  }

  function adjustUnreadCounts(item: AdminNotification, direction: -1 | 1) {
    if (item.read) return;
    feedUnreadCount.value = Math.max(0, feedUnreadCount.value + direction);
    if (item.severity !== 'info') {
      feedUrgentUnreadCount.value = Math.max(0, feedUrgentUnreadCount.value + direction);
    }
  }

  function beginMutation() {
    activeMutations += 1;
    requestVersion += 1;
    loading.value = false;
  }

  async function finishMutation(reload: boolean) {
    reloadAfterMutations ||= reload;
    activeMutations = Math.max(0, activeMutations - 1);
    if (activeMutations || !reloadAfterMutations) return;
    reloadAfterMutations = false;
    await load();
  }

  function announceChange() {
    window.dispatchEvent(new CustomEvent('nono:notifications-changed', { detail: 'home' }));
  }

  function onFocus() {
    void load();
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void load();
  }

  function onNotificationsChanged(event: Event) {
    if (event instanceof CustomEvent && event.detail === 'home') return;
    void load();
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function startPolling() {
    stopPolling();
    if (mounted && toValue(enabled)) pollTimer = setInterval(() => void load(), POLL_INTERVAL_MS);
  }

  function disable() {
    requestVersion += 1;
    loading.value = false;
    error.value = '';
    items.value = [];
    feedUnreadCount.value = 0;
    feedUrgentUnreadCount.value = 0;
    if (activeMutations) reloadAfterMutations = true;
    stopPolling();
  }

  watch(() => toValue(enabled), (allowed) => {
    if (!mounted) return;
    if (!allowed) {
      disable();
      return;
    }
    startPolling();
    void load();
  });

  onMounted(() => {
    mounted = true;
    window.addEventListener('focus', onFocus);
    window.addEventListener('nono:notifications-changed', onNotificationsChanged);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (toValue(enabled)) {
      startPolling();
      void load();
    }
  });

  onBeforeUnmount(() => {
    mounted = false;
    stopPolling();
    requestVersion += 1;
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('nono:notifications-changed', onNotificationsChanged);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return {
    items,
    loading,
    error,
    unreadCount,
    urgentItems,
    urgentOverflow,
    load,
    markRead,
    dismiss,
    markAllRead,
  };
}
